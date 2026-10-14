-- Remove the broad legacy blood stock access policy and keep inventory scoped
-- to active operational accounts. Blood bank administrators are the only users
-- who may edit stock, and only for their assigned bank.
BEGIN;

ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.blood_inventory;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.blood_inventory;
DROP POLICY IF EXISTS "Blood inventory read access" ON public.blood_inventory;
DROP POLICY IF EXISTS "Blood inventory write access" ON public.blood_inventory;
DROP POLICY IF EXISTS "blood_inventory_read_active_scoped" ON public.blood_inventory;
DROP POLICY IF EXISTS "blood_inventory_write_active_own_bank" ON public.blood_inventory;

CREATE POLICY "blood_inventory_read_active_scoped"
  ON public.blood_inventory
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
      AND u.status IS TRUE
      AND (
        u.role IN ('government_admin', 'clinician_reviewer', 'hospital_admin', 'hospital_approver')
        OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_inventory.blood_bank_id)
      )
  ));

CREATE POLICY "blood_inventory_write_active_own_bank"
  ON public.blood_inventory
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id
    WHERE u.user_id = auth.uid()
      AND u.status IS TRUE
      AND u.role = 'blood_bank_admin'
      AND b.status = 'Active'
      AND u.blood_bank_id = blood_inventory.blood_bank_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id
    WHERE u.user_id = auth.uid()
      AND u.status IS TRUE
      AND u.role = 'blood_bank_admin'
      AND b.status = 'Active'
      AND u.blood_bank_id = blood_inventory.blood_bank_id
  ));

-- Notification recipients cannot be resolved by a blood bank account through
-- users RLS, and direct notification inserts are restricted to self. Keep the
-- broadcast narrowly scoped and authoritative in the database.
CREATE OR REPLACE FUNCTION public.notify_low_blood_stock(
  p_blood_group text,
  p_usable_units integer,
  p_minimum_threshold integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_inserted integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true
     OR v_user.role::text <> 'blood_bank_admin'
     OR v_user.blood_bank_id IS NULL THEN
    RAISE EXCEPTION 'An active blood bank administrator account is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.blood_banks b
    WHERE b.blood_bank_id = v_user.blood_bank_id AND b.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'An active blood bank facility is required';
  END IF;

  IF p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
     OR p_usable_units IS NULL OR p_usable_units < 0
     OR p_minimum_threshold IS NULL OR p_minimum_threshold < 0 THEN
    RAISE EXCEPTION 'Invalid blood stock alert values';
  END IF;

  IF p_usable_units > p_minimum_threshold THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.blood_inventory bi
    WHERE bi.blood_bank_id = v_user.blood_bank_id
      AND bi.blood_group::text = p_blood_group
      AND GREATEST(bi.available_units - bi.reserved_units - bi.expired_units, 0) = p_usable_units
      AND bi.minimum_threshold = p_minimum_threshold
  ) THEN
    RAISE EXCEPTION 'Blood stock alert must match saved inventory';
  END IF;

  INSERT INTO public.notifications (receiver_id, title, message, priority, is_read, created_at, updated_at)
  SELECT u.user_id,
         'LOW BLOOD STOCK ALERT: ' || p_blood_group,
         format('Blood bank inventory for %s has fallen to %s usable units (Minimum threshold: %s).',
           p_blood_group, p_usable_units, p_minimum_threshold),
         'Critical', false, now(), now()
  FROM public.users u
  WHERE u.role::text = 'government_admin' AND u.status IS TRUE;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_low_blood_stock(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_low_blood_stock(text, integer, integer) TO authenticated;

COMMIT;
