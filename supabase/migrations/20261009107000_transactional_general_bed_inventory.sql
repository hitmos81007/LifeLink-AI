-- Make general-bed counts an atomic, audited database operation. The browser
-- may read scoped inventory, but authenticated users cannot write the table
-- directly or overwrite reservations created by clinical workflows.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_general_bed_inventory(
  p_hospital_id UUID,
  p_total_beds INTEGER,
  p_occupied_beds INTEGER,
  p_minimum_beds INTEGER,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_reason_code TEXT DEFAULT NULL
) RETURNS public.general_bed_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_row public.general_bed_inventory;
  v_old JSONB;
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
  IF p_total_beds IS NULL OR p_occupied_beds IS NULL OR p_minimum_beds IS NULL
     OR p_total_beds < 0 OR p_occupied_beds < 0 OR p_minimum_beds < 0
     OR p_minimum_beds > p_total_beds THEN
    RAISE EXCEPTION 'Bed counts must be non-negative and the minimum cannot exceed total beds';
  END IF;
  IF p_reason_code IS NOT NULL AND p_reason_code NOT IN
     ('routine_count','received_delivery','correction','other') THEN
    RAISE EXCEPTION 'Unsupported inventory reason code';
  END IF;

  SELECT * INTO v_row FROM public.general_bed_inventory
  WHERE hospital_id = p_hospital_id FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
      RAISE EXCEPTION 'General-bed inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    v_old := to_jsonb(v_row);
    IF p_occupied_beds + v_row.reserved_beds > p_total_beds THEN
      RAISE EXCEPTION 'Occupied and reserved beds cannot exceed total beds';
    END IF;
    UPDATE public.general_bed_inventory
    SET total_beds = p_total_beds,
        occupied_beds = p_occupied_beds,
        available_beds = p_total_beds - p_occupied_beds - v_row.reserved_beds,
        minimum_beds = p_minimum_beds,
        updated_at = now()
    WHERE bed_inventory_id = v_row.bed_inventory_id
    RETURNING * INTO v_row;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'General-bed inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    IF p_occupied_beds > p_total_beds THEN
      RAISE EXCEPTION 'Occupied beds cannot exceed total beds';
    END IF;
    INSERT INTO public.general_bed_inventory (
      hospital_id, total_beds, occupied_beds, reserved_beds,
      available_beds, minimum_beds, created_at, updated_at
    ) VALUES (
      p_hospital_id, p_total_beds, p_occupied_beds, 0,
      p_total_beds - p_occupied_beds, p_minimum_beds, now(), now()
    )
    ON CONFLICT (hospital_id) DO NOTHING
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'General-bed inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id,
    CASE WHEN v_old IS NULL THEN 'GENERAL_BED_INVENTORY_CREATED' ELSE 'GENERAL_BED_INVENTORY_UPDATED' END,
    'general_bed_inventory',
    v_row.bed_inventory_id,
    v_old,
    to_jsonb(v_row) || jsonb_build_object('reason_code', p_reason_code),
    now()
  );
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_general_bed_inventory(UUID, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_general_bed_inventory(UUID, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;

DO $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='general_bed_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.general_bed_inventory', v_policy.policyname);
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.general_bed_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT (minimum_beds), UPDATE (minimum_beds) ON public.general_bed_inventory FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
