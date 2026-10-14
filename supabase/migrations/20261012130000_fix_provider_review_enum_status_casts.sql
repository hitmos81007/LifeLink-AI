-- Keep provider status updates compatible with the hospital_status enum used
-- by hospitals, blood_banks, and ambulance_providers.
BEGIN;

CREATE OR REPLACE FUNCTION public.review_provider_account(
  p_user_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.users;
  v_target public.users;
  v_provider_id UUID;
  v_kind TEXT;
  v_action TEXT;
  v_review_id UUID;
  v_provider_rows INTEGER;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE users.user_id = auth.uid();
  IF NOT FOUND
     OR v_actor.role::text <> 'platform_admin'
     OR v_actor.status IS DISTINCT FROM true
     OR v_actor.account_status <> 'active' THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Administrators cannot review their own provider account'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('activate', 'suspend', 'revoke') THEN
    RAISE EXCEPTION 'Unsupported provider account decision';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A review reason between 3 and 500 characters is required';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.role::text NOT IN ('hospital_admin', 'blood_bank_admin', 'ambulance_admin') THEN
    RAISE EXCEPTION 'Provider account was not found';
  END IF;
  IF v_target.account_status = 'revoked' THEN RAISE EXCEPTION 'Revoked provider accounts cannot be reactivated'; END IF;
  IF v_target.account_status = 'pending' AND p_decision = 'suspend' THEN
    v_action := 'suspended';
  ELSIF p_decision = 'activate' THEN
    v_action := 'activated';
  ELSIF p_decision = 'suspend' THEN
    v_action := 'suspended';
  ELSE
    v_action := 'revoked';
  END IF;

  IF v_target.role::text = 'hospital_admin' THEN
    v_kind := 'hospital'; v_provider_id := v_target.hospital_id;
  ELSIF v_target.role::text = 'blood_bank_admin' THEN
    v_kind := 'blood_bank'; v_provider_id := v_target.blood_bank_id;
  ELSE
    v_kind := 'ambulance'; v_provider_id := v_target.ambulance_provider_id;
  END IF;
  IF v_provider_id IS NULL AND p_decision = 'activate' THEN
    RAISE EXCEPTION 'Provider account has no linked facility; repair the profile before activation';
  END IF;

  PERFORM set_config('lifelink.provider_account_transition', 'on', true);
  UPDATE public.users
  SET account_status = CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
      status = (p_decision = 'activate'),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF v_provider_id IS NULL THEN
    NULL; -- Suspensions and revocations still work for orphaned legacy accounts.
  ELSIF v_kind = 'hospital' THEN
    UPDATE public.hospitals
    SET verification_status = CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
        status = (CASE WHEN p_decision = 'activate' THEN 'Active' ELSE 'Inactive' END)::public.hospital_status,
        updated_at = now()
    WHERE hospital_id = v_provider_id;
  ELSIF v_kind = 'blood_bank' THEN
    UPDATE public.blood_banks
    SET verification_status = CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
        status = (CASE WHEN p_decision = 'activate' THEN 'Active' ELSE 'Inactive' END)::public.hospital_status,
        updated_at = now()
    WHERE blood_bank_id = v_provider_id;
  ELSE
    UPDATE public.ambulance_providers
    SET verification_status = CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
        status = (CASE WHEN p_decision = 'activate' THEN 'Active' ELSE 'Inactive' END)::public.hospital_status,
        updated_at = now()
    WHERE provider_id = v_provider_id;
  END IF;

  IF v_provider_id IS NOT NULL THEN
    GET DIAGNOSTICS v_provider_rows = ROW_COUNT;
    IF v_provider_rows <> 1 THEN RAISE EXCEPTION 'Linked provider record was not updated'; END IF;
  END IF;

  INSERT INTO public.provider_account_reviews(user_id, provider_kind, provider_id, action, reason, actor_id)
  VALUES (p_user_id, v_kind, v_provider_id, v_action, btrim(p_reason), auth.uid())
  RETURNING review_id INTO v_review_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'provider_kind', v_kind,
    'provider_id', v_provider_id,
    'account_status', CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
    'review_id', v_review_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_provider_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_provider_account(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
