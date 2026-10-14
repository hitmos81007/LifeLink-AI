-- Hospital registration must never create fictitious capacity or oxygen stock.
-- This AFTER trigger also corrects the legacy values created by older versions
-- of handle_new_user(), but only for facilities created by this signup event.
CREATE OR REPLACE FUNCTION public.zero_new_hospital_signup_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_hospital_id UUID;
BEGIN
  v_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_role <> 'hospital_admin' THEN
    RETURN NEW;
  END IF;

  SELECT hospital_id INTO v_hospital_id
    FROM public.users WHERE user_id = NEW.id;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Hospital account was created without its linked facility';
  END IF;

  UPDATE public.icu_inventory
    SET total_icu_beds = 0, occupied_icu_beds = 0,
        reserved_icu_beds = 0, available_icu_beds = 0, updated_at = now()
    WHERE hospital_id = v_hospital_id;
  UPDATE public.general_bed_inventory
    SET total_beds = 0, occupied_beds = 0,
        reserved_beds = 0, available_beds = 0, updated_at = now()
    WHERE hospital_id = v_hospital_id;
  UPDATE public.oxygen_inventory
    SET total_capacity = 0, available_capacity = 0,
        minimum_threshold = 0, updated_at = now()
    WHERE hospital_id = v_hospital_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.zero_new_hospital_signup_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zero_new_hospital_signup_inventory() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS zero_new_hospital_signup_inventory ON auth.users;
CREATE TRIGGER zero_new_hospital_signup_inventory
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.zero_new_hospital_signup_inventory();
