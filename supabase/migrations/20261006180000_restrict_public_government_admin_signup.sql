-- Government-wide oversight and audit access must never be self-assigned.
-- raw_app_meta_data is controlled by trusted Auth Admin operations; public
-- signup can set raw_user_meta_data only. A trusted provisioner may create a
-- coordinator account by setting app_metadata.trusted_role_provisioning=true.
CREATE OR REPLACE FUNCTION public.guard_government_admin_signup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_role TEXT;
BEGIN
  v_requested_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_requested_role = 'government_admin'
     AND COALESCE(NEW.raw_app_meta_data->>'trusted_role_provisioning', 'false') <> 'true' THEN
    RAISE EXCEPTION 'District coordinator accounts must be provisioned by a trusted administrator';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_government_admin_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_government_admin_signup() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS guard_government_admin_signup ON auth.users;
CREATE TRIGGER guard_government_admin_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_government_admin_signup();

COMMENT ON FUNCTION public.guard_government_admin_signup() IS
  'Rejects self-service government_admin signup; trusted Auth Admin provisioning must set app_metadata.trusted_role_provisioning=true.';
