-- Require a coarse city/town/local-area label on public signup and persist it
-- with the authoritative profile. Facility address and provider approval rules
-- remain unchanged; patient location is intentionally coarse, not a home address.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_location_label TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_signup_location_label_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_signup_location_label_check
  CHECK (
    signup_location_label IS NULL
    OR length(btrim(signup_location_label)) BETWEEN 2 AND 120
  );

CREATE OR REPLACE FUNCTION public.validate_signup_location_label()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  v_location TEXT := btrim(COALESCE(NEW.raw_user_meta_data->>'location_label', ''));
BEGIN
  IF v_role IN ('patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin')
     AND length(v_location) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Registration failed: enter a city, town, or local area (2 to 120 characters).';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_signup_location_label() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bbb_validate_signup_location_label ON auth.users;
CREATE TRIGGER bbb_validate_signup_location_label
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_signup_location_label();

CREATE OR REPLACE FUNCTION public.persist_signup_location_label()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  v_location TEXT := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'location_label', '')), '');
BEGIN
  IF v_role IN ('patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin') THEN
    UPDATE public.users
       SET signup_location_label = v_location,
           updated_at = now()
     WHERE user_id = NEW.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registration failed: user profile was not created before location persistence.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_signup_location_label() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zzzz_persist_signup_location_label ON auth.users;
CREATE TRIGGER zzzz_persist_signup_location_label
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.persist_signup_location_label();

COMMENT ON COLUMN public.users.signup_location_label IS
  'Coarse city, town, or local area supplied during signup; must not contain a patient home address.';
