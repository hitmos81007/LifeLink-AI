-- Restricted, audited provisioning for synthetic demo accounts.
-- Platform administrators can promote only confirmed, active patient accounts into
-- protected operational roles. Public signup and platform-admin bootstrapping stay separate.

ALTER TABLE public.platform_role_provisioning_audit
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS prior_hospital_id UUID REFERENCES public.hospitals(hospital_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS new_hospital_id UUID REFERENCES public.hospitals(hospital_id) ON DELETE RESTRICT;

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
      WHERE u.role::text='patient' AND u.status IS TRUE AND u.account_status='active'
        AND au.email_confirmed_at IS NOT NULL
        AND u.hospital_id IS NULL AND u.blood_bank_id IS NULL AND u.ambulance_provider_id IS NULL
    ), '[]'::jsonb),
    'hospitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id',h.hospital_id,'hospital_name',h.hospital_name,'district',h.district,'state',h.state
      ) ORDER BY h.state,h.district,h.hospital_name,h.hospital_id)
      FROM public.hospitals h
      WHERE h.verification_status='active' AND h.status='Active'
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
  IF p_new_role NOT IN ('clinician_reviewer','government_admin','hospital_approver') THEN
    RAISE EXCEPTION 'This workflow cannot provision that role';
  END IF;
  IF length(v_reason)<3 OR length(v_reason)>500 THEN RAISE EXCEPTION 'A reason of 3 to 500 characters is required'; END IF;
  IF (p_new_role='hospital_approver') IS DISTINCT FROM (p_hospital_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Select an active hospital only for a hospital approver';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.role::text<>'patient' OR v_target.status IS NOT TRUE OR v_target.account_status<>'active'
     OR v_target.hospital_id IS NOT NULL OR v_target.blood_bank_id IS NOT NULL OR v_target.ambulance_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active patient demo account without a provider link may be provisioned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id=p_user_id AND au.email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The target account must have a confirmed email';
  END IF;
  IF p_new_role='hospital_approver' THEN
    SELECT * INTO v_hospital FROM public.hospitals
      WHERE hospital_id=p_hospital_id AND verification_status='active' AND status='Active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active, verified hospital'; END IF;
  END IF;

  PERFORM set_config('lifelink.provider_account_transition','on',true);
  UPDATE public.users
    SET role=p_new_role::public.user_role,
        hospital_id=CASE WHEN p_new_role='hospital_approver' THEN p_hospital_id ELSE NULL END,
        updated_at=now()
    WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demo account role update failed'; END IF;

  INSERT INTO public.platform_role_provisioning_audit(
    user_id,prior_role,new_role,reason,actor_id,prior_hospital_id,new_hospital_id
  ) VALUES (
    p_user_id,v_target.role::text,p_new_role,v_reason,auth.uid(),v_target.hospital_id,
    CASE WHEN p_new_role='hospital_approver' THEN p_hospital_id ELSE NULL END
  );

  RETURN jsonb_build_object('user_id',p_user_id,'role',p_new_role,
    'hospital_id',CASE WHEN p_new_role='hospital_approver' THEN p_hospital_id ELSE NULL END,
    'account_status',v_target.account_status);
END;
$$;
REVOKE ALL ON FUNCTION public.provision_demo_account_role(UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_demo_account_role(UUID,TEXT,UUID,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
