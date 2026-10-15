-- Keep the provider-review RPC output types aligned with its RETURNS TABLE
-- declaration. PostgreSQL requires exact types for PL/pgSQL RETURN QUERY.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_provider_accounts_for_review()
RETURNS TABLE (
  user_id UUID, full_name TEXT, email TEXT, role TEXT, account_status TEXT,
  provider_id UUID, provider_name TEXT, district TEXT, state TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.users;
BEGIN
  SELECT * INTO v_actor
  FROM public.users
  WHERE users.user_id = auth.uid();

  IF NOT FOUND
     OR v_actor.role::text <> 'platform_admin'
     OR v_actor.status IS DISTINCT FROM true
     OR v_actor.account_status::text <> 'active' THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;

  RETURN QUERY
    SELECT
      u.user_id::uuid,
      u.full_name::text,
      u.email::text,
      u.role::text,
      u.account_status::text,
      COALESCE(h.hospital_id, b.blood_bank_id, a.provider_id)::uuid,
      COALESCE(h.hospital_name, b.blood_bank_name, a.provider_name)::text,
      COALESCE(h.district, b.district, a.district)::text,
      COALESCE(h.state, b.state, a.state)::text,
      u.created_at::timestamptz
    FROM public.users AS u
    LEFT JOIN public.hospitals AS h ON h.hospital_id = u.hospital_id
    LEFT JOIN public.blood_banks AS b ON b.blood_bank_id = u.blood_bank_id
    LEFT JOIN public.ambulance_providers AS a ON a.provider_id = u.ambulance_provider_id
    WHERE u.role::text IN ('hospital_admin', 'blood_bank_admin', 'ambulance_admin')
    ORDER BY
      CASE u.account_status::text
        WHEN 'pending' THEN 0
        WHEN 'suspended' THEN 1
        WHEN 'active' THEN 2
        ELSE 3
      END,
      u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_provider_accounts_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_provider_accounts_for_review() TO authenticated;

COMMIT;
