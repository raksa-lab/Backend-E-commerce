CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx
  ON public.order_status_history (order_id, created_at ASC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_status_valid'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_valid
      CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')) NOT VALID;
  END IF;
END;
$$;

INSERT INTO public.order_status_history (order_id, from_status, to_status, actor_id, note, created_at)
SELECT o.id, NULL, o.status, o.user_id, 'Existing order status recorded during migration', o.created_at
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_status_history h WHERE h.order_id = o.id
);

CREATE OR REPLACE FUNCTION public.record_initial_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor_id, note, created_at)
  VALUES (NEW.id, NULL, NEW.status, NEW.user_id, 'Order created', NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_record_initial_status ON public.orders;
CREATE TRIGGER orders_record_initial_status
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.record_initial_order_status();

CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_target_status text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_previous_status text;
BEGIN
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('customer', 'admin') THEN
    RAISE EXCEPTION 'Invalid actor role' USING ERRCODE = '22023';
  END IF;
  IF p_target_status IS NULL OR p_target_status NOT IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note must be at most 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_role <> 'admin' AND v_order.user_id <> p_actor_id THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  v_previous_status := v_order.status;
  IF p_target_status = 'cancelled' THEN
    IF (p_actor_role = 'customer' AND v_previous_status <> 'pending')
      OR (p_actor_role = 'admin' AND v_previous_status NOT IN ('pending', 'processing')) THEN
      RAISE EXCEPTION 'Order cannot be cancelled from status %', v_previous_status USING ERRCODE = 'P0001';
    END IF;

    FOR v_item IN
      SELECT variant_id, SUM(quantity)::integer AS quantity
      FROM public.order_items
      WHERE order_id = p_order_id
      GROUP BY variant_id
      ORDER BY variant_id
    LOOP
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.variant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Order variant no longer exists' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.inventory_movements
        (variant_id, change_type, quantity, note, actor_id, order_id)
      VALUES
        (v_item.variant_id, 'add', v_item.quantity, COALESCE(p_note, 'Order cancellation restock'), p_actor_id, p_order_id);
    END LOOP;
  ELSIF p_actor_role <> 'admin'
    OR NOT (
      (v_previous_status = 'pending' AND p_target_status = 'processing')
      OR (v_previous_status = 'processing' AND p_target_status = 'shipped')
      OR (v_previous_status = 'shipped' AND p_target_status = 'delivered')
    ) THEN
    RAISE EXCEPTION 'Invalid order status transition from % to %', v_previous_status, p_target_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders
  SET status = p_target_status, updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor_id, note)
  VALUES (p_order_id, v_previous_status, p_target_status, p_actor_id, p_note);

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.change_order_status(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_initial_order_status() FROM PUBLIC;
REVOKE ALL ON TABLE public.order_status_history FROM PUBLIC;
