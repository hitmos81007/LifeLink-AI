-- Require an explicit platform-admin designation before an account is described as
-- synthetic, and keep demo hospital roles scoped to synthetic demo facilities.

CREATE TABLE IF NOT EXISTS public.synthetic_demo_accounts (
  user_id UUID PRIMARY KEY REFERENCES public.users(user_id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  registered_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  registration_reason TEXT NOT NULL CHECK (length(btrim(registration_reason)) BETWEEN 3 AND 500),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  revocation_reason TEXT,
  revoked_at TIMESTAMPTZ,
  CHECK ((is_active AND revoked_by IS NULL AND revoked_at IS NULL AND revocation_reason IS NULL)
      OR (NOT is_active AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.synthetic_demo_account_audit (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('registered','reactivated','revoked')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  actor_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS synthetic_demo_account_audit_user_created_idx
  ON public.synthetic_demo_account_audit(user_id,created_at DESC);
COMMENT ON TABLE public.synthetic_demo_accounts IS
  'Platform-admin verified registry of accounts dedicated to synthetic demonstration; role provisioning requires an active registration.';
COMMENT ON TABLE public.synthetic_demo_account_audit IS
  'Append-only platform-admin registration and revocation decisions for synthetic demo accounts.';

ALTER TABLE public.synthetic_demo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_demo_account_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS synthetic_demo_account_audit_platform_admin_read ON public.synthetic_demo_account_audit;
CREATE POLICY synthetic_demo_account_audit_platform_admin_read
  ON public.synthetic_demo_account_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id=auth.uid()
      AND u.role::text='platform_admin' AND u.status IS TRUE AND u.account_status='active'
  ));
REVOKE ALL ON public.synthetic_demo_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.synthetic_demo_account_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.synthetic_demo_account_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.get_synthetic_demo_registration_candidates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor public.users;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_actor.role::text<>'platform_admin' OR v_actor.status IS NOT TRUE OR v_actor.account_status<>'active' THEN
    RAISE EXCEPTION 'Only an active platform administrator may review synthetic demo candidates';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id',u.user_id,'full_name',u.full_name,'email',u.email,'created_at',u.created_at
    ) ORDER BY u.created_at,u.user_id)
    FROM public.users u
    JOIN auth.users au ON au.id=u.user_id
    LEFT JOIN public.synthetic_demo_accounts d ON d.user_id=u.user_id AND d.is_active IS TRUE
    WHERE u.role::text='patient' AND u.status IS TRUE AND u.account_status='active'
      AND au.email_confirmed_at IS NOT NULL
      AND u.hospital_id IS NULL AND u.blood_bank_id IS NULL AND u.ambulance_provider_id IS NULL
      AND d.user_id IS NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_synthetic_demo_registration_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_synthetic_demo_registration_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.register_synthetic_demo_account(
  p_user_id UUID,
  p_reason TEXT,
  p_confirmed_synthetic BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor public.users; v_target public.users; v_action TEXT; v_reason TEXT := btrim(COALESCE(p_reason,''));
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_actor.role::text<>'platform_admin' OR v_actor.status IS NOT TRUE OR v_actor.account_status<>'active' THEN
    RAISE EXCEPTION 'Only an active platform administrator may register a synthetic demo account';
  END IF;
  IF p_confirmed_synthetic IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Confirm that this account is dedicated to synthetic testing';
  END IF;
  IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Choose a different patient account'; END IF;
  IF length(v_reason)<3 OR length(v_reason)>500 THEN RAISE EXCEPTION 'A verification reason of 3 to 500 characters is required'; END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.role::text<>'patient' OR v_target.status IS NOT TRUE OR v_target.account_status<>'active'
     OR v_target.hospital_id IS NOT NULL OR v_target.blood_bank_id IS NOT NULL OR v_target.ambulance_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active unlinked patient account may be registered';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id=p_user_id AND au.email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The account must have a confirmed email';
  END IF;

  INSERT INTO public.synthetic_demo_accounts(user_id,is_active,registered_by,registration_reason,registered_at,revoked_by,revocation_reason,revoked_at)
  VALUES(p_user_id,TRUE,auth.uid(),v_reason,now(),NULL,NULL,NULL)
  ON CONFLICT (user_id) DO UPDATE SET is_active=TRUE,registered_by=EXCLUDED.registered_by,
    registration_reason=EXCLUDED.registration_reason,registered_at=now(),revoked_by=NULL,revocation_reason=NULL,revoked_at=NULL
  WHERE public.synthetic_demo_accounts.is_active=FALSE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account is already registered as synthetic or could not be registered'; END IF;
  v_action := CASE WHEN EXISTS (SELECT 1 FROM public.synthetic_demo_account_audit a WHERE a.user_id=p_user_id) THEN 'reactivated' ELSE 'registered' END;
  INSERT INTO public.synthetic_demo_account_audit(user_id,action,reason,actor_id)
  VALUES(p_user_id,v_action,v_reason,auth.uid());
  RETURN jsonb_build_object('user_id',p_user_id,'is_active',TRUE,'action',v_action);
END;
$$;
REVOKE ALL ON FUNCTION public.register_synthetic_demo_account(UUID,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_synthetic_demo_account(UUID,TEXT,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_synthetic_demo_account(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor public.users; v_target public.users; v_reason TEXT := btrim(COALESCE(p_reason,'')); v_demo public.synthetic_demo_accounts;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_actor.role::text<>'platform_admin' OR v_actor.status IS NOT TRUE OR v_actor.account_status<>'active' THEN
    RAISE EXCEPTION 'Only an active platform administrator may revoke a synthetic demo account';
  END IF;
  IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Choose a different demo account'; END IF;
  IF length(v_reason)<3 OR length(v_reason)>500 THEN RAISE EXCEPTION 'A revocation reason of 3 to 500 characters is required'; END IF;
  SELECT * INTO v_demo FROM public.synthetic_demo_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT v_demo.is_active THEN RAISE EXCEPTION 'Active synthetic demo registration was not found'; END IF;
  SELECT * INTO v_target FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic demo account was not found'; END IF;
  IF v_target.role::text<>'patient' THEN
    IF v_target.role::text NOT IN ('clinician_reviewer','government_admin','hospital_admin','hospital_approver') THEN
      RAISE EXCEPTION 'This synthetic account has an unsupported role and requires manual review';
    END IF;
    PERFORM set_config('lifelink.provider_account_transition','on',true);
    UPDATE public.users SET role='patient'::public.user_role,hospital_id=NULL,blood_bank_id=NULL,
      ambulance_provider_id=NULL,updated_at=now() WHERE user_id=p_user_id;
    INSERT INTO public.platform_role_provisioning_audit(
      user_id,prior_role,new_role,reason,actor_id,prior_hospital_id,new_hospital_id
    ) VALUES (p_user_id,v_target.role::text,'patient',v_reason,auth.uid(),v_target.hospital_id,NULL);
  END IF;
  UPDATE public.synthetic_demo_accounts SET is_active=FALSE,revoked_by=auth.uid(),revocation_reason=v_reason,revoked_at=now()
    WHERE user_id=p_user_id;
  INSERT INTO public.synthetic_demo_account_audit(user_id,action,reason,actor_id)
  VALUES(p_user_id,'revoked',v_reason,auth.uid());
  RETURN jsonb_build_object('user_id',p_user_id,'is_active',FALSE,'action','revoked');
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_synthetic_demo_account(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_synthetic_demo_account(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_demo_role_provisioning_options()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_actor public.users;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_actor.role::text<>'platform_admin' OR v_actor.status IS NOT TRUE OR v_actor.account_status<>'active' THEN
    RAISE EXCEPTION 'Only an active platform administrator may provision demo roles';
  END IF;

  RETURN jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id',u.user_id,'full_name',u.full_name,'email',u.email,'created_at',u.created_at
      ) ORDER BY u.created_at,u.user_id)
      FROM public.users u
      JOIN auth.users au ON au.id=u.user_id
      JOIN public.synthetic_demo_accounts d ON d.user_id=u.user_id AND d.is_active IS TRUE
      WHERE u.role::text='patient' AND u.status IS TRUE AND u.account_status='active'
        AND au.email_confirmed_at IS NOT NULL
        AND u.hospital_id IS NULL AND u.blood_bank_id IS NULL AND u.ambulance_provider_id IS NULL
    ), '[]'::jsonb),
    'hospitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id',h.hospital_id,'hospital_name',h.hospital_name,'district',h.district,'state',h.state
      ) ORDER BY h.state,h.district,h.hospital_name,h.hospital_id)
      FROM public.hospitals h
      WHERE h.verification_status='active' AND h.status='Active' AND h.hospital_code LIKE 'LL-DEMO-HOSP-%'
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_demo_role_provisioning_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_demo_role_provisioning_options() TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_demo_account_role(
  p_user_id UUID,
  p_new_role TEXT,
  p_hospital_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor public.users;
  v_target public.users;
  v_hospital public.hospitals;
  v_reason TEXT := btrim(COALESCE(p_reason,''));
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_actor.role::text<>'platform_admin' OR v_actor.status IS NOT TRUE OR v_actor.account_status<>'active' THEN
    RAISE EXCEPTION 'Only an active platform administrator may provision demo roles';
  END IF;
  IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Choose a different confirmed demo account'; END IF;
  IF p_new_role NOT IN ('clinician_reviewer','government_admin','hospital_admin','hospital_approver') THEN
    RAISE EXCEPTION 'This workflow cannot provision that role';
  END IF;
  IF length(v_reason)<3 OR length(v_reason)>500 THEN RAISE EXCEPTION 'A reason of 3 to 500 characters is required'; END IF;
  IF (p_new_role IN ('hospital_admin','hospital_approver')) IS DISTINCT FROM (p_hospital_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Select a demo hospital only for a hospital admin or approver';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.role::text<>'patient' OR v_target.status IS NOT TRUE OR v_target.account_status<>'active'
     OR v_target.hospital_id IS NOT NULL OR v_target.blood_bank_id IS NOT NULL OR v_target.ambulance_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active unlinked demo patient account may be provisioned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id=p_user_id AND au.email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The target account must have a confirmed email';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.synthetic_demo_accounts d WHERE d.user_id=p_user_id AND d.is_active IS TRUE) THEN
    RAISE EXCEPTION 'The target account must first be registered as dedicated synthetic demo data';
  END IF;
  IF p_hospital_id IS NOT NULL THEN
    SELECT * INTO v_hospital FROM public.hospitals
      WHERE hospital_id=p_hospital_id AND verification_status='active' AND status='Active'
        AND hospital_code LIKE 'LL-DEMO-HOSP-%' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active synthetic demo hospital'; END IF;
  END IF;

  PERFORM set_config('lifelink.provider_account_transition','on',true);
  UPDATE public.users
    SET role=p_new_role::public.user_role,
        hospital_id=CASE WHEN p_new_role IN ('hospital_admin','hospital_approver') THEN p_hospital_id ELSE NULL END,
        updated_at=now()
    WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demo account role update failed'; END IF;

  INSERT INTO public.platform_role_provisioning_audit(
    user_id,prior_role,new_role,reason,actor_id,prior_hospital_id,new_hospital_id
  ) VALUES (
    p_user_id,v_target.role::text,p_new_role,v_reason,auth.uid(),v_target.hospital_id,
    CASE WHEN p_new_role IN ('hospital_admin','hospital_approver') THEN p_hospital_id ELSE NULL END
  );

  RETURN jsonb_build_object('user_id',p_user_id,'role',p_new_role,
    'hospital_id',CASE WHEN p_new_role IN ('hospital_admin','hospital_approver') THEN p_hospital_id ELSE NULL END,
    'account_status',v_target.account_status);
END;
$$;
REVOKE ALL ON FUNCTION public.provision_demo_account_role(UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_demo_account_role(UUID,TEXT,UUID,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
