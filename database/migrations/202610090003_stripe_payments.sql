ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS amount_cents bigint,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_amount_cents_positive'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_cents_positive
      CHECK (amount_cents IS NULL OR amount_cents > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_currency_valid'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_currency_valid CHECK (currency = lower(currency) AND length(currency) = 3) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_status_valid'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_valid
      CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'partially_refunded', 'refunded')) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_uidx
  ON public.payments (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_intent_uidx
  ON public.payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_order_created_idx
  ON public.payments (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = lower(currency) AND length(currency) = 3),
  reason text CHECK (reason IS NULL OR reason IN ('duplicate', 'fraudulent', 'requested_by_customer')),
  refund_status text NOT NULL DEFAULT 'pending'
    CHECK (refund_status IN ('pending', 'succeeded', 'failed', 'canceled')),
  stripe_refund_id text UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_refunds_payment_created_idx
  ON public.payment_refunds (payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prepare_payment_attempt(
  p_order_id uuid,
  p_user_id uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_amount_cents bigint;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not payable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_payment.order_id <> p_order_id THEN
      RAISE EXCEPTION 'Idempotency key already used' USING ERRCODE = 'P0001';
    END IF;
    RETURN to_jsonb(v_payment);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id = p_order_id AND payment_status IN ('succeeded', 'partially_refunded', 'refunded')
  ) THEN
    RAISE EXCEPTION 'Order is already paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND payment_status = 'pending'
    AND amount_cents IS NOT NULL AND idempotency_key IS NOT NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN to_jsonb(v_payment);
  END IF;

  v_amount_cents := round(v_order.final_amount * 100)::bigint;
  IF v_amount_cents < 50 THEN
    RAISE EXCEPTION 'Order total is below the Stripe USD minimum' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (
    order_id, payment_method, provider, payment_status,
    amount_cents, currency, idempotency_key
  ) VALUES (
    p_order_id, 'stripe', 'stripe', 'pending',
    v_amount_cents, 'usd', p_idempotency_key
  ) RETURNING * INTO v_payment;

  RETURN to_jsonb(v_payment);
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_payment_session(
  p_payment_id uuid,
  p_session_id text,
  p_payment_intent_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) > 255 THEN
    RAISE EXCEPTION 'Invalid Stripe checkout session' USING ERRCODE = '22023';
  END IF;
  UPDATE public.payments
  SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_session_id),
      stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
      updated_at = now()
  WHERE id = p_payment_id AND payment_status = 'pending'
    AND (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id = p_session_id)
  RETURNING * INTO v_payment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt is no longer pending' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(v_payment);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_stripe_webhook(
  p_event_id text,
  p_event_type text,
  p_event_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_object jsonb := p_event_data -> 'data' -> 'object';
  v_payment public.payments%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item record;
  v_status text;
BEGIN
  IF p_event_id IS NULL OR p_event_id = '' OR p_event_type IS NULL OR v_object IS NULL THEN
    RAISE EXCEPTION 'Invalid Stripe event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_webhook_events (event_id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  IF p_event_type = 'checkout.session.completed' THEN
    SELECT p.* INTO v_payment
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.id = (v_object -> 'metadata' ->> 'payment_id')::uuid
      AND p.order_id = (v_object -> 'metadata' ->> 'order_id')::uuid
      AND p.stripe_checkout_session_id = v_object ->> 'id'
    FOR UPDATE OF p;
    IF NOT FOUND OR v_payment.amount_cents <> (v_object ->> 'amount_total')::bigint
      OR v_payment.currency <> v_object ->> 'currency' THEN
      RAISE EXCEPTION 'Checkout session does not match payment' USING ERRCODE = 'P0001';
    END IF;
    IF v_object ->> 'payment_status' = 'paid' AND v_payment.payment_status = 'pending' THEN
      UPDATE public.payments
      SET payment_status = 'succeeded',
          stripe_payment_intent_id = v_object ->> 'payment_intent',
          transaction_id = v_object ->> 'payment_intent',
          updated_at = now()
      WHERE id = v_payment.id;
    END IF;
  ELSIF p_event_type = 'checkout.session.expired' THEN
    SELECT * INTO v_payment FROM public.payments
    WHERE stripe_checkout_session_id = v_object ->> 'id' FOR UPDATE;
    IF FOUND AND v_payment.payment_status = 'pending' THEN
      UPDATE public.payments SET payment_status = 'failed', updated_at = now()
      WHERE id = v_payment.id;
      SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;
      IF FOUND AND v_order.status = 'pending' THEN
        FOR v_item IN
          SELECT variant_id, SUM(quantity)::integer AS quantity
          FROM public.order_items WHERE order_id = v_order.id
          GROUP BY variant_id ORDER BY variant_id
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
            (v_item.variant_id, 'add', v_item.quantity, 'Expired unpaid Stripe checkout', v_order.user_id, v_order.id);
        END LOOP;
        UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
        INSERT INTO public.order_status_history (order_id, from_status, to_status, actor_id, note)
        VALUES (v_order.id, 'pending', 'cancelled', v_order.user_id, 'Unpaid checkout session expired');
      END IF;
    END IF;
  ELSIF p_event_type = 'refund.updated' THEN
    SELECT * INTO v_refund FROM public.payment_refunds
    WHERE id = (v_object -> 'metadata' ->> 'payment_refund_id')::uuid FOR UPDATE;
    IF FOUND THEN
      v_status := CASE v_object ->> 'status'
        WHEN 'succeeded' THEN 'succeeded'
        WHEN 'failed' THEN 'failed'
        WHEN 'canceled' THEN 'canceled'
        ELSE 'pending'
      END;
      UPDATE public.payment_refunds
      SET stripe_refund_id = COALESCE(stripe_refund_id, v_object ->> 'id'),
          refund_status = CASE WHEN refund_status = 'pending' THEN v_status ELSE refund_status END,
          updated_at = now()
      WHERE id = v_refund.id;
      SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
      PERFORM public.refresh_payment_refund_status(v_payment.id);
    END IF;
  END IF;

  RETURN jsonb_build_object('duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_payment_refund_status(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total bigint;
  v_succeeded bigint;
BEGIN
  SELECT amount_cents INTO v_total FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_succeeded
  FROM public.payment_refunds
  WHERE payment_id = p_payment_id AND refund_status = 'succeeded';
  UPDATE public.payments
  SET payment_status = CASE
        WHEN v_succeeded >= v_total THEN 'refunded'
        WHEN v_succeeded > 0 THEN 'partially_refunded'
        ELSE 'succeeded'
      END,
      updated_at = now()
  WHERE id = p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_payment_refund(
  p_payment_id uuid,
  p_actor_id uuid,
  p_amount_cents bigint,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_remaining bigint;
  v_amount bigint;
BEGIN
  IF p_idempotency_key IS NULL OR (p_amount_cents IS NOT NULL AND p_amount_cents < 1)
    OR (p_reason IS NOT NULL AND p_reason NOT IN ('duplicate', 'fraudulent', 'requested_by_customer')) THEN
    RAISE EXCEPTION 'Invalid refund request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_refund FROM public.payment_refunds
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_refund.payment_id <> p_payment_id OR
      (p_amount_cents IS NOT NULL AND p_amount_cents <> v_refund.amount_cents) THEN
      RAISE EXCEPTION 'Idempotency key reused with different refund data' USING ERRCODE = 'P0001';
    END IF;
    RETURN to_jsonb(v_refund) || jsonb_build_object('stripe_payment_intent_id', v_payment.stripe_payment_intent_id);
  END IF;
  IF v_payment.payment_status NOT IN ('succeeded', 'partially_refunded')
    OR v_payment.stripe_payment_intent_id IS NULL THEN
    RAISE EXCEPTION 'Payment cannot be refunded' USING ERRCODE = 'P0001';
  END IF;

  SELECT v_payment.amount_cents - COALESCE(SUM(amount_cents), 0) INTO v_remaining
  FROM public.payment_refunds
  WHERE payment_id = p_payment_id AND refund_status IN ('pending', 'succeeded');
  v_amount := COALESCE(p_amount_cents, v_remaining);
  IF v_amount < 1 OR v_amount > v_remaining THEN
    RAISE EXCEPTION 'Refund exceeds the remaining payment amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_refunds (
    payment_id, amount_cents, currency, reason, refund_status, idempotency_key, actor_id
  ) VALUES (
    p_payment_id, v_amount, v_payment.currency, p_reason, 'pending', p_idempotency_key, p_actor_id
  ) RETURNING * INTO v_refund;
  RETURN to_jsonb(v_refund) || jsonb_build_object('stripe_payment_intent_id', v_payment.stripe_payment_intent_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_payment_refund(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_refund_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
BEGIN
  IF p_refund_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'Invalid refund status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.payment_refunds
  SET stripe_refund_id = COALESCE(stripe_refund_id, p_stripe_refund_id),
      refund_status = CASE WHEN refund_status = 'pending' THEN p_refund_status ELSE refund_status END,
      updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.refresh_payment_refund_status(v_refund.payment_id);
  RETURN to_jsonb(v_refund);
END;
$$;

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
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
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
      FROM public.order_items WHERE order_id = p_order_id
      GROUP BY variant_id ORDER BY variant_id
    LOOP
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.variant_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Order variant no longer exists' USING ERRCODE = 'P0001'; END IF;
      INSERT INTO public.inventory_movements
        (variant_id, change_type, quantity, note, actor_id, order_id)
      VALUES
        (v_item.variant_id, 'add', v_item.quantity, COALESCE(p_note, 'Order cancellation restock'), p_actor_id, p_order_id);
    END LOOP;
  ELSIF p_target_status IN ('processing', 'shipped', 'delivered')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE order_id = p_order_id AND payment_status IN ('succeeded', 'partially_refunded')
    ) THEN
    RAISE EXCEPTION 'Payment confirmation is required before order processing' USING ERRCODE = 'P0001';
  ELSIF p_actor_role <> 'admin'
    OR NOT (
      (v_previous_status = 'pending' AND p_target_status = 'processing')
      OR (v_previous_status = 'processing' AND p_target_status = 'shipped')
      OR (v_previous_status = 'shipped' AND p_target_status = 'delivered')
    ) THEN
    RAISE EXCEPTION 'Invalid order status transition from % to %', v_previous_status, p_target_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders SET status = p_target_status, updated_at = now()
  WHERE id = p_order_id RETURNING * INTO v_order;
  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor_id, note)
  VALUES (p_order_id, v_previous_status, p_target_status, p_actor_id, p_note);
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_payment_attempt(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_payment_session(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_stripe_webhook(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_payment_refund(uuid, uuid, bigint, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_payment_refund(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_payment_refund_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_order_status(uuid, uuid, text, text, text) FROM PUBLIC;
