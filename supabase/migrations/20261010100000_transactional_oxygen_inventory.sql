-- Serialize oxygen inventory writes, protect version conflicts, and audit
-- every facility inventory change in the same database transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_oxygen_inventory(
  p_hospital_id UUID,
  p_oxygen_type TEXT,
  p_total_capacity NUMERIC,
  p_available_capacity NUMERIC,
  p_minimum_threshold NUMERIC,
  p_unit TEXT,
  p_oxygen_inventory_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
) RETURNS public.oxygen_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_hospital_id UUID;
  v_row public.oxygen_inventory;
  v_old JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Active hospital administrator account required';
  END IF;
  IF p_hospital_id IS NOT NULL AND v_user.hospital_id <> p_hospital_id THEN
    RAISE EXCEPTION 'Oxygen inventory may only be changed for the assigned hospital';
  END IF;
  v_hospital_id := COALESCE(p_hospital_id, v_user.hospital_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.hospitals h
    WHERE h.hospital_id = v_hospital_id AND h.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Assigned hospital is not active';
  END IF;
  IF p_oxygen_type IS NULL OR length(btrim(p_oxygen_type)) NOT BETWEEN 1 AND 50
     OR p_total_capacity IS NULL OR p_available_capacity IS NULL
     OR p_minimum_threshold IS NULL
     OR p_total_capacity < 0 OR p_available_capacity < 0 OR p_minimum_threshold < 0
     OR p_available_capacity > p_total_capacity
     OR p_minimum_threshold > p_total_capacity THEN
    RAISE EXCEPTION 'Oxygen capacities and minimum must be non-negative, and available/minimum cannot exceed total capacity';
  END IF;
  IF p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Oxygen unit is required and must be 30 characters or fewer';
  END IF;

  -- Serializes creation or renaming of the same oxygen type within a hospital.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_hospital_id::text || ':' || lower(btrim(p_oxygen_type)), 0
  ));

  IF p_oxygen_inventory_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Refresh oxygen inventory before creating a record' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.oxygen_inventory oi
      WHERE oi.hospital_id = v_hospital_id
        AND lower(btrim(oi.oxygen_type)) = lower(btrim(p_oxygen_type))
    ) THEN
      RAISE EXCEPTION 'Oxygen type already exists; refresh and edit the existing record' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.oxygen_inventory (
      hospital_id, oxygen_type, total_capacity, available_capacity,
      minimum_threshold, unit, created_at, updated_at
    ) VALUES (
      v_hospital_id, btrim(p_oxygen_type)::public.oxygen_type, p_total_capacity, p_available_capacity,
      p_minimum_threshold, btrim(p_unit), now(), now()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.oxygen_inventory
    WHERE oxygen_inventory_id = p_oxygen_inventory_id FOR UPDATE;
    IF NOT FOUND OR v_row.hospital_id <> v_hospital_id THEN
      RAISE EXCEPTION 'Oxygen inventory record was not found for the assigned hospital';
    END IF;
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
      RAISE EXCEPTION 'Oxygen inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.oxygen_inventory oi
      WHERE oi.hospital_id = v_hospital_id
        AND oi.oxygen_inventory_id <> p_oxygen_inventory_id
        AND lower(btrim(oi.oxygen_type)) = lower(btrim(p_oxygen_type))
    ) THEN
      RAISE EXCEPTION 'Another oxygen record already uses this type';
    END IF;
    v_old := to_jsonb(v_row);
    UPDATE public.oxygen_inventory
    SET oxygen_type = btrim(p_oxygen_type)::public.oxygen_type,
        total_capacity = p_total_capacity,
        available_capacity = p_available_capacity,
        minimum_threshold = p_minimum_threshold,
        unit = btrim(p_unit),
        updated_at = now()
    WHERE oxygen_inventory_id = p_oxygen_inventory_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id,
    CASE WHEN v_old IS NULL THEN 'OXYGEN_INVENTORY_CREATED' ELSE 'OXYGEN_INVENTORY_UPDATED' END,
    'oxygen_inventory',
    v_row.oxygen_inventory_id,
    v_old,
    to_jsonb(v_row),
    now()
  );
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_oxygen_inventory(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TIMESTAMP WITHOUT TIME ZONE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_oxygen_inventory(UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TIMESTAMP WITHOUT TIME ZONE) TO authenticated;

DO $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.oxygen_inventory', v_policy.policyname);
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.oxygen_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT (hospital_id, oxygen_type, total_capacity, available_capacity, minimum_threshold, unit, created_at, updated_at)
  ON public.oxygen_inventory FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (oxygen_type, total_capacity, available_capacity, minimum_threshold, unit, updated_at)
  ON public.oxygen_inventory FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
