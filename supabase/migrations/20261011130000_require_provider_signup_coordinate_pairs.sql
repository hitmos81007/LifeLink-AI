-- Provider facility locations are optional, but latitude and longitude must be
-- supplied together and must form a valid geographic coordinate pair.
CREATE OR REPLACE FUNCTION public.validate_provider_signup_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_role TEXT := NEW.raw_user_meta_data->>'role';
  v_latitude_text TEXT;
  v_longitude_text TEXT;
  v_latitude NUMERIC;
  v_longitude NUMERIC;
BEGIN
  IF v_role NOT IN ('hospital_admin', 'blood_bank_admin') THEN
    RETURN NEW;
  END IF;

  v_latitude_text := NULLIF(BTRIM(NEW.raw_user_meta_data->>'latitude'), '');
  v_longitude_text := NULLIF(BTRIM(NEW.raw_user_meta_data->>'longitude'), '');

  IF (v_latitude_text IS NULL) <> (v_longitude_text IS NULL) THEN
    RAISE EXCEPTION 'Registration failed: enter both latitude and longitude, or leave both blank.';
  END IF;
  IF v_latitude_text IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_latitude := v_latitude_text::NUMERIC;
    v_longitude := v_longitude_text::NUMERIC;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Registration failed: facility coordinates must be valid numbers.';
  END;

  IF v_latitude NOT BETWEEN -90 AND 90 OR v_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Registration failed: facility coordinates are outside valid geographic bounds.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_provider_signup_coordinates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_provider_signup_coordinates() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS aaa_validate_provider_signup_coordinates ON auth.users;
CREATE TRIGGER aaa_validate_provider_signup_coordinates
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_provider_signup_coordinates();

COMMENT ON FUNCTION public.validate_provider_signup_coordinates() IS
  'Rejects partial or out-of-range facility coordinates in public hospital and blood bank signup metadata before profile provisioning.';
