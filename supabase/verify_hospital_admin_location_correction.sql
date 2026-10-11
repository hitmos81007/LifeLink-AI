-- Read-only verification for 20261017120000_hospital_admin_location_correction.sql.
-- Confirms direct table writes are blocked and only authenticated callers can
-- execute the audited, role-scoped, version-checked location RPC.
BEGIN READ ONLY;

DO $$
DECLARE
  v_fn REGPROCEDURE := 'public.update_hospital_location(uuid,numeric,numeric,timestamp with time zone)'::REGPROCEDURE;
  v_definition TEXT;
  v_public_execute BOOLEAN;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION 'Hospital location RPC must be SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Hospital location RPC must be executable only by authenticated users';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = v_fn AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) INTO v_public_execute;
  IF v_public_execute THEN
    RAISE EXCEPTION 'Hospital location RPC must not be executable by PUBLIC';
  END IF;

  IF has_table_privilege('authenticated', 'public.hospitals', 'UPDATE')
     OR has_table_privilege('anon', 'public.hospitals', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.hospitals', 'latitude', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.hospitals', 'longitude', 'UPDATE')
     OR has_column_privilege('anon', 'public.hospitals', 'latitude', 'UPDATE')
     OR has_column_privilege('anon', 'public.hospitals', 'longitude', 'UPDATE') THEN
    RAISE EXCEPTION 'Direct hospital or coordinate updates remain available';
  END IF;

  SELECT pg_get_functiondef(v_fn) INTO v_definition;
  IF position('auth.uid()' IN v_definition) = 0
     OR position('hospital_admin' IN v_definition) = 0
     OR position('v_user.hospital_id <> p_hospital_id' IN v_definition) = 0
     OR position('verification_status = ''active''' IN v_definition) = 0
     OR position('p_latitude NOT BETWEEN -90 AND 90' IN v_definition) = 0
     OR position('p_longitude NOT BETWEEN -180 AND 180' IN v_definition) = 0
     OR position('FOR UPDATE' IN v_definition) = 0
     OR position('40001' IN v_definition) = 0
     OR position('audit_logs' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Hospital location RPC is missing a required scope, validation, concurrency, or audit check';
  END IF;

  RAISE NOTICE 'PASS: location edits use an authenticated, active-hospital-admin-scoped RPC; direct hospital updates are revoked; coordinate, concurrency, and audit checks are present.';
END;
$$;

COMMIT;
