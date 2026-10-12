-- Persist the GPS/map-selected signup coordinates for every public stakeholder.
-- Patient profile points are rounded to about 1 km before storage; facility
-- signup triggers continue to store precise hospital and blood-bank coordinates.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS signup_longitude NUMERIC;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_signup_coordinates_pair_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_signup_coordinates_pair_check
  CHECK (
    (signup_latitude IS NULL AND signup_longitude IS NULL)
    OR (
      signup_latitude BETWEEN -90 AND 90
      AND signup_longitude BETWEEN -180 AND 180
    )
  );

-- The auth insert trigger runner needs explicit execution rights after the
-- prior location migration revoked default PUBLIC execution.
GRANT EXECUTE ON FUNCTION public.validate_signup_location_label() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.persist_signup_location_label() TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.validate_signup_gps_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  v_latitude NUMERIC;
  v_longitude NUMERIC;
BEGIN
  IF v_role NOT IN ('patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_latitude := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'latitude', '')), '')::NUMERIC;
    v_longitude := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'longitude', '')), '')::NUMERIC;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Registration failed: choose a valid GPS or map location.';
  END;

  IF v_latitude IS NULL OR v_longitude IS NULL THEN
    RAISE EXCEPTION 'Registration failed: GPS coordinates are required for signup.';
  END IF;
  IF v_latitude NOT BETWEEN -90 AND 90 OR v_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Registration failed: GPS coordinates are outside valid geographic bounds.';
  END IF;

  IF v_role = 'patient' THEN
    NEW.raw_user_meta_data := jsonb_set(
      jsonb_set(NEW.raw_user_meta_data, '{latitude}', to_jsonb(round(v_latitude, 2)), true),
      '{longitude}', to_jsonb(round(v_longitude, 2)), true
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_signup_gps_coordinates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_signup_gps_coordinates() TO supabase_auth_admin;
DROP TRIGGER IF EXISTS aab_validate_signup_gps_coordinates ON auth.users;
CREATE TRIGGER aab_validate_signup_gps_coordinates
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_signup_gps_coordinates();

CREATE OR REPLACE FUNCTION public.persist_signup_gps_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  v_latitude NUMERIC;
  v_longitude NUMERIC;
BEGIN
  IF v_role NOT IN ('patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin') THEN
    RETURN NEW;
  END IF;

  v_latitude := (NEW.raw_user_meta_data->>'latitude')::NUMERIC;
  v_longitude := (NEW.raw_user_meta_data->>'longitude')::NUMERIC;
  IF v_role = 'patient' THEN
    v_latitude := round(v_latitude, 2);
    v_longitude := round(v_longitude, 2);
  END IF;

  UPDATE public.users
     SET signup_latitude = v_latitude,
         signup_longitude = v_longitude,
         updated_at = now()
   WHERE user_id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration failed: user profile was not created before GPS location persistence.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_signup_gps_coordinates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_signup_gps_coordinates() TO supabase_auth_admin;
DROP TRIGGER IF EXISTS zzzzz_persist_signup_gps_coordinates ON auth.users;
CREATE TRIGGER zzzzz_persist_signup_gps_coordinates
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.persist_signup_gps_coordinates();

COMMENT ON COLUMN public.users.signup_latitude IS
  'GPS/map-selected signup latitude; patient values are rounded to two decimals before storage.';
COMMENT ON COLUMN public.users.signup_longitude IS
  'GPS/map-selected signup longitude; patient values are rounded to two decimals before storage.';
