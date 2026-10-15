-- Make ICU bed counts an atomic, audited database operation. ICU beds reserved
-- by clinical allocation remain protected from hospital stock-count edits.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_icu_inventory(
  p_hospital_id UUID,
  p_total_icu_beds INTEGER,
  p_available_icu_beds INTEGER,
  p_minimum_icu_beds INTEGER,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS public.icu_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_row public.icu_inventory;
  v_old JSONB;
  v_reserved INTEGER;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Active hospital administrator account required';
  END IF;
  IF v_user.hospital_id <> p_hospital_id THEN
    RAISE EXCEPTION 'Inventory may only be changed for the assigned hospital';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospitals h
    WHERE h.hospital_id = v_user.hospital_id AND h.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Assigned hospital is not active';
  END IF;
  IF p_total_icu_beds IS NULL OR p_available_icu_beds IS NULL OR p_minimum_icu_beds IS NULL
     OR p_total_icu_beds < 0 OR p_available_icu_beds < 0 OR p_minimum_icu_beds < 0
     OR p_available_icu_beds > p_total_icu_beds OR p_minimum_icu_beds > p_total_icu_beds THEN
    RAISE EXCEPTION 'ICU counts must be non-negative and available/minimum cannot exceed total beds';
  END IF;

  SELECT * INTO v_row FROM public.icu_inventory
  WHERE hospital_id = p_hospital_id FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
      RAISE EXCEPTION 'ICU inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    v_old := to_jsonb(v_row);
    v_reserved := v_row.reserved_icu_beds;
    IF p_available_icu_beds + v_reserved > p_total_icu_beds THEN
      RAISE EXCEPTION 'Available and reserved ICU beds cannot exceed total beds';
    END IF;
    UPDATE public.icu_inventory
    SET total_icu_beds = p_total_icu_beds,
        occupied_icu_beds = p_total_icu_beds - p_available_icu_beds - v_reserved,
        available_icu_beds = p_available_icu_beds,
        minimum_icu_beds = p_minimum_icu_beds,
        updated_at = now()
    WHERE icu_inventory_id = v_row.icu_inventory_id
    RETURNING * INTO v_row;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'ICU inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.icu_inventory (
      hospital_id, total_icu_beds, occupied_icu_beds, reserved_icu_beds,
      available_icu_beds, minimum_icu_beds, created_at, updated_at
    ) VALUES (
      p_hospital_id, p_total_icu_beds, p_total_icu_beds - p_available_icu_beds, 0,
      p_available_icu_beds, p_minimum_icu_beds, now(), now()
    )
    ON CONFLICT (hospital_id) DO NOTHING
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ICU inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id,
    CASE WHEN v_old IS NULL THEN 'ICU_INVENTORY_CREATED' ELSE 'ICU_INVENTORY_UPDATED' END,
    'icu_inventory',
    v_row.icu_inventory_id,
    v_old,
    to_jsonb(v_row),
    now()
  );
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_icu_inventory(UUID, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_icu_inventory(UUID, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ) TO authenticated;

DO $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='icu_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.icu_inventory', v_policy.policyname);
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.icu_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT (minimum_icu_beds), UPDATE (minimum_icu_beds) ON public.icu_inventory FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
