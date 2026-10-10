-- Prevent suspended hospital accounts from creating or advancing transfers.
-- Preserve the existing transactional implementations behind private wrappers.
BEGIN;

ALTER FUNCTION public.request_resource_transfer(UUID, TEXT, TEXT, INTEGER, TEXT, UUID)
  RENAME TO request_resource_transfer_internal;
ALTER FUNCTION public.transition_resource_transfer(UUID, TEXT, INTEGER, TEXT)
  RENAME TO transition_resource_transfer_internal;

REVOKE ALL ON FUNCTION public.request_resource_transfer_internal(UUID, TEXT, TEXT, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_resource_transfer_internal(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.request_resource_transfer(
  p_destination_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_remarks TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
) RETURNS public.resource_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'hospital_admin'
     OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active hospital administrator account is required';
  END IF;
  SELECT * INTO v_transfer FROM public.request_resource_transfer_internal(
    p_destination_hospital_id, p_resource_type, p_resource_name,
    p_quantity, p_remarks, p_idempotency_key
  );
  RETURN v_transfer;
END;
$$;

CREATE FUNCTION public.transition_resource_transfer(
  p_transfer_id UUID,
  p_new_status TEXT,
  p_quantity INTEGER DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text NOT IN ('hospital_admin', 'hospital_approver')
     OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active hospital account is required';
  END IF;
  SELECT * INTO v_transfer FROM public.transition_resource_transfer_internal(
    p_transfer_id, p_new_status, p_quantity, p_remarks
  );
  RETURN v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.request_resource_transfer(UUID, TEXT, TEXT, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_resource_transfer(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_resource_transfer(UUID, TEXT, TEXT, INTEGER, TEXT, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_resource_transfer(UUID, TEXT, INTEGER, TEXT)
  TO authenticated;

COMMIT;
