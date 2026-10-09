ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_stock_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_stock_quantity_nonnegative CHECK (stock_quantity >= 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  change_type text NOT NULL CHECK (change_type IN ('add', 'deduct')),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_variant_created_idx
  ON public.inventory_movements (variant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(
  p_variant_id uuid,
  p_actor_id uuid,
  p_change_type text,
  p_quantity integer,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock integer;
  v_movement public.inventory_movements%ROWTYPE;
BEGIN
  IF p_change_type NOT IN ('add', 'deduct') OR p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Invalid inventory adjustment' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note must be at most 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT stock_quantity INTO v_stock
  FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_change_type = 'deduct' AND v_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.product_variants
  SET stock_quantity = stock_quantity + CASE WHEN p_change_type = 'add' THEN p_quantity ELSE -p_quantity END
  WHERE id = p_variant_id RETURNING stock_quantity INTO v_stock;

  INSERT INTO public.inventory_movements (variant_id, change_type, quantity, note, actor_id)
  VALUES (p_variant_id, p_change_type, p_quantity, p_note, p_actor_id)
  RETURNING * INTO v_movement;

  RETURN jsonb_build_object(
    'variant_id', p_variant_id,
    'stock_quantity', v_stock,
    'movement', to_jsonb(v_movement)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_order(
  p_user_id uuid,
  p_address_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id uuid;
  v_order public.orders%ROWTYPE;
  v_line record;
  v_locked record;
  v_total numeric(12, 2) := 0;
BEGIN
  PERFORM 1 FROM public.user_addresses WHERE id = p_address_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id) THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = 'P0001';
  END IF;

  FOR v_locked IN
    SELECT pv.id AS variant_id
    FROM public.product_variants pv
    WHERE EXISTS (
      SELECT 1 FROM public.cart_items ci
      WHERE ci.cart_id = v_cart_id AND ci.variant_id = pv.id
    )
    ORDER BY pv.id
    FOR UPDATE OF pv
  LOOP
    SELECT pv.id AS variant_id, pv.price, pv.stock_quantity, SUM(ci.quantity)::integer AS quantity
    INTO v_line
    FROM public.product_variants pv
    JOIN public.cart_items ci ON ci.variant_id = pv.id
    WHERE ci.cart_id = v_cart_id AND pv.id = v_locked.variant_id
    GROUP BY pv.id, pv.price, pv.stock_quantity;

    IF v_line.quantity < 1 OR v_line.stock_quantity < v_line.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %', v_line.variant_id USING ERRCODE = 'P0001';
    END IF;
    IF v_line.price IS NULL OR v_line.price < 0 THEN
      RAISE EXCEPTION 'Invalid variant price' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + round(v_line.price::numeric, 2) * v_line.quantity;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.cart_items ci
    LEFT JOIN public.product_variants pv ON pv.id = ci.variant_id
    WHERE ci.cart_id = v_cart_id AND pv.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A cart product variant no longer exists' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.orders (user_id, address_id, total_amount, final_amount, status)
  VALUES (p_user_id, p_address_id, v_total, v_total, 'pending')
  RETURNING * INTO v_order;

  FOR v_line IN
    SELECT pv.id AS variant_id, pv.price, SUM(ci.quantity)::integer AS quantity
    FROM public.cart_items ci
    JOIN public.product_variants pv ON pv.id = ci.variant_id
    WHERE ci.cart_id = v_cart_id
    GROUP BY pv.id, pv.price
    ORDER BY pv.id
  LOOP
    UPDATE public.product_variants
    SET stock_quantity = stock_quantity - v_line.quantity
    WHERE id = v_line.variant_id;

    INSERT INTO public.order_items (order_id, variant_id, quantity, price)
    VALUES (v_order.id, v_line.variant_id, v_line.quantity, round(v_line.price::numeric, 2));

    INSERT INTO public.inventory_movements (variant_id, change_type, quantity, note, actor_id, order_id)
    VALUES (v_line.variant_id, 'deduct', v_line.quantity, 'Checkout', p_user_id, v_order.id);
  END LOOP;

  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_inventory(uuid, uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkout_order(uuid, uuid) FROM PUBLIC;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC;
