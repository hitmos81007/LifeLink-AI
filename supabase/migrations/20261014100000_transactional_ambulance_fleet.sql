-- Route ambulance fleet registration and edits through owner-scoped,
-- version-checked transactions with row-keyed auditing.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_ambulance(
  p_provider_id UUID,
  p_vehicle_number TEXT,
  p_ambulance_type TEXT,
  p_driver_name TEXT,
  p_driver_phone TEXT DEFAULT NULL,
  p_current_latitude NUMERIC DEFAULT NULL,
  p_current_longitude NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT 'Available'
) RETURNS public.ambulances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_row public.ambulances;
  v_vehicle_number TEXT;
  v_type public.ambulance_type;
  v_status public.ambulance_status;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'ambulance_admin' OR v_user.ambulance_provider_id IS NULL THEN
    RAISE EXCEPTION 'Active ambulance administrator account required';
  END IF;
  IF p_provider_id IS NOT NULL AND p_provider_id <> v_user.ambulance_provider_id THEN
    RAISE EXCEPTION 'Ambulances may only be registered with the assigned provider';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ambulance_providers ap WHERE ap.provider_id = v_user.ambulance_provider_id AND ap.status = 'Active') THEN
    RAISE EXCEPTION 'Assigned ambulance provider is not active';
  END IF;
  PERFORM set_config('lifelink.current_actor_id', v_user.user_id::text, true);

  v_vehicle_number := upper(btrim(p_vehicle_number));
  IF v_vehicle_number IS NULL OR length(v_vehicle_number) NOT BETWEEN 1 AND 32
     OR p_driver_name IS NULL OR length(btrim(p_driver_name)) NOT BETWEEN 1 AND 120
     OR (p_driver_phone IS NOT NULL AND length(btrim(p_driver_phone)) > 40)
     OR ((p_current_latitude IS NULL) <> (p_current_longitude IS NULL))
     OR (p_current_latitude IS NOT NULL AND (p_current_latitude < -90 OR p_current_latitude > 90))
     OR (p_current_longitude IS NOT NULL AND (p_current_longitude < -180 OR p_current_longitude > 180)) THEN
    RAISE EXCEPTION 'Ambulance vehicle, driver, phone, or coordinate values are invalid; latitude and longitude must both be set or both be empty';
  END IF;
  BEGIN
    v_type := p_ambulance_type::public.ambulance_type;
    v_status := p_status::public.ambulance_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Ambulance type or status is not supported';
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(lower(v_vehicle_number), 0));
  IF EXISTS (SELECT 1 FROM public.ambulances a WHERE upper(btrim(a.vehicle_number)) = v_vehicle_number) THEN
    RAISE EXCEPTION 'A vehicle with this registration number is already in the fleet';
  END IF;
  INSERT INTO public.ambulances (
    provider_id, vehicle_number, ambulance_type, driver_name, driver_phone,
    current_latitude, current_longitude, status, created_at, updated_at
  ) VALUES (
    v_user.ambulance_provider_id, v_vehicle_number, v_type, btrim(p_driver_name),
    NULLIF(btrim(p_driver_phone), ''), p_current_latitude, p_current_longitude,
    v_status, now(), now()
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ambulance(
  p_ambulance_id UUID,
  p_expected_updated_at TIMESTAMP WITHOUT TIME ZONE,
  p_ambulance_type TEXT,
  p_driver_name TEXT,
  p_driver_phone TEXT,
  p_current_latitude NUMERIC,
  p_current_longitude NUMERIC,
  p_status TEXT,
  p_assigned_hospital UUID
) RETURNS public.ambulances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_row public.ambulances;
  v_type public.ambulance_type;
  v_status public.ambulance_status;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'ambulance_admin' OR v_user.ambulance_provider_id IS NULL THEN
    RAISE EXCEPTION 'Active ambulance administrator account required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ambulance_providers ap WHERE ap.provider_id = v_user.ambulance_provider_id AND ap.status = 'Active') THEN
    RAISE EXCEPTION 'Assigned ambulance provider is not active';
  END IF;
  PERFORM set_config('lifelink.current_actor_id', v_user.user_id::text, true);

  SELECT * INTO v_row FROM public.ambulances
  WHERE ambulance_id = p_ambulance_id AND provider_id = v_user.ambulance_provider_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ambulance was not found in the assigned provider fleet'; END IF;
  IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
    RAISE EXCEPTION 'Ambulance fleet changed; refresh and retry' USING ERRCODE = '40001';
  END IF;
  IF p_driver_name IS NULL OR length(btrim(p_driver_name)) NOT BETWEEN 1 AND 120
     OR (p_driver_phone IS NOT NULL AND length(btrim(p_driver_phone)) > 40)
     OR ((p_current_latitude IS NULL) <> (p_current_longitude IS NULL))
     OR (p_current_latitude IS NOT NULL AND (p_current_latitude < -90 OR p_current_latitude > 90))
     OR (p_current_longitude IS NOT NULL AND (p_current_longitude < -180 OR p_current_longitude > 180)) THEN
    RAISE EXCEPTION 'Ambulance driver, phone, or coordinate values are invalid; latitude and longitude must both be set or both be empty';
  END IF;
  IF p_assigned_hospital IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospitals h WHERE h.hospital_id = p_assigned_hospital AND h.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Assigned hospital must be an active hospital';
  END IF;
  BEGIN
    v_type := p_ambulance_type::public.ambulance_type;
    v_status := p_status::public.ambulance_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Ambulance type or status is not supported';
  END;
  UPDATE public.ambulances
  SET ambulance_type = v_type, driver_name = btrim(p_driver_name),
      driver_phone = NULLIF(btrim(p_driver_phone), ''),
      current_latitude = p_current_latitude, current_longitude = p_current_longitude,
      status = v_status, assigned_hospital = p_assigned_hospital, updated_at = now()
  WHERE ambulance_id = p_ambulance_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ambulance(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ambulance(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.update_ambulance(UUID, TIMESTAMP WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ambulance(UUID, TIMESTAMP WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO authenticated;

-- Preserve audit coverage but use the ambulance primary key and verified RPC actor.
CREATE OR REPLACE FUNCTION public.audit_ambulance_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    COALESCE(NULLIF(current_setting('lifelink.current_actor_id', true), '')::UUID, auth.uid()),
    CASE WHEN TG_OP = 'INSERT' THEN 'AMBULANCE_CREATED' ELSE 'AMBULANCE_UPDATED' END,
    'ambulances', NEW.ambulance_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_ambulance_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_ambulance_audit ON public.ambulances;
CREATE TRIGGER trg_ambulance_audit AFTER INSERT OR UPDATE ON public.ambulances
  FOR EACH ROW EXECUTE FUNCTION public.audit_ambulance_change();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ambulances FROM PUBLIC, anon, authenticated;
REVOKE INSERT (provider_id, vehicle_number, ambulance_type, driver_name, driver_phone, current_latitude, current_longitude, status, assigned_hospital, created_at, updated_at)
  ON public.ambulances FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (provider_id, vehicle_number, ambulance_type, driver_name, driver_phone, current_latitude, current_longitude, status, assigned_hospital, updated_at)
  ON public.ambulances FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
