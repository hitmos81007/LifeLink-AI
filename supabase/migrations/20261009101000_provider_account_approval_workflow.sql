-- Provider accounts require explicit platform review before they can publish availability.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT;

UPDATE public.users
SET account_status = CASE WHEN status IS TRUE THEN 'active' ELSE 'suspended' END
WHERE account_status IS NULL
   OR account_status NOT IN ('pending','active','suspended','revoked')
   OR (status IS DISTINCT FROM TRUE AND account_status='active');

ALTER TABLE public.users ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE public.users ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('pending','active','suspended','revoked'));

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.blood_banks
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.ambulance_providers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_verification_status_check;
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_verification_status_check
  CHECK (verification_status IN ('pending','active','suspended','revoked'));
ALTER TABLE public.blood_banks DROP CONSTRAINT IF EXISTS blood_banks_verification_status_check;
ALTER TABLE public.blood_banks ADD CONSTRAINT blood_banks_verification_status_check
  CHECK (verification_status IN ('pending','active','suspended','revoked'));
ALTER TABLE public.ambulance_providers DROP CONSTRAINT IF EXISTS ambulance_providers_verification_status_check;
ALTER TABLE public.ambulance_providers ADD CONSTRAINT ambulance_providers_verification_status_check
  CHECK (verification_status IN ('pending','active','suspended','revoked'));

-- Existing provider accounts have no recorded verification event, so they enter the
-- review queue too. Do not infer verification from the legacy Active label.
UPDATE public.users SET status=false, account_status='pending', updated_at=now()
WHERE role::text IN ('hospital_admin','blood_bank_admin','ambulance_admin');
UPDATE public.hospitals h SET status='Inactive', verification_status='pending', updated_at=now()
FROM public.users u WHERE u.hospital_id=h.hospital_id AND u.role::text='hospital_admin';
UPDATE public.blood_banks b SET status='Inactive', verification_status='pending', updated_at=now()
FROM public.users u WHERE u.blood_bank_id=b.blood_bank_id AND u.role::text='blood_bank_admin';
UPDATE public.ambulance_providers a SET status='Inactive', verification_status='pending', updated_at=now()
FROM public.users u WHERE u.ambulance_provider_id=a.provider_id AND u.role::text='ambulance_admin';

CREATE TABLE IF NOT EXISTS public.provider_account_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('hospital','blood_bank','ambulance')),
  provider_id UUID,
  action TEXT NOT NULL CHECK (action IN ('pending','activated','suspended','revoked')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  actor_id UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Legacy provider profiles can be unlinked after their facility is deleted. Keep those
-- accounts reviewable so platform admins can suspend/revoke them with an audit trail.
ALTER TABLE public.provider_account_reviews ALTER COLUMN provider_id DROP NOT NULL;

INSERT INTO public.provider_account_reviews(user_id,provider_kind,provider_id,action,reason,actor_id)
SELECT u.user_id,'hospital',u.hospital_id,'pending','Existing provider account requires initial platform verification.',NULL
FROM public.users u WHERE u.role::text='hospital_admin'
UNION ALL
SELECT u.user_id,'blood_bank',u.blood_bank_id,'pending','Existing provider account requires initial platform verification.',NULL
FROM public.users u WHERE u.role::text='blood_bank_admin'
UNION ALL
SELECT u.user_id,'ambulance',u.ambulance_provider_id,'pending','Existing provider account requires initial platform verification.',NULL
FROM public.users u WHERE u.role::text='ambulance_admin';

CREATE INDEX IF NOT EXISTS provider_account_reviews_user_created_idx
  ON public.provider_account_reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS users_account_status_idx
  ON public.users(account_status, role);

CREATE TABLE IF NOT EXISTS public.platform_role_provisioning_audit (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  prior_role TEXT NOT NULL,
  new_role TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_role_provisioning_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_role_provisioning_audit_read ON public.platform_role_provisioning_audit;
CREATE POLICY platform_role_provisioning_audit_read
  ON public.platform_role_provisioning_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id=auth.uid()
      AND u.role::text='platform_admin' AND u.status IS TRUE AND u.account_status='active'
  ));
REVOKE ALL ON public.platform_role_provisioning_audit FROM anon, authenticated;
GRANT SELECT ON public.platform_role_provisioning_audit TO authenticated;

ALTER TABLE public.provider_account_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_account_reviews_platform_admin_read ON public.provider_account_reviews;
CREATE POLICY provider_account_reviews_platform_admin_read
  ON public.provider_account_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.role::text = 'platform_admin'
      AND u.status IS TRUE AND u.account_status = 'active'
  ));
REVOKE ALL ON public.provider_account_reviews FROM anon, authenticated;
GRANT SELECT ON public.provider_account_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_provider_account_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('lifelink.provider_account_transition',true)='on'
     OR auth.role()='service_role'
     OR (auth.uid() IS NULL AND current_user IN ('postgres','supabase_admin')) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='users' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.account_status IS DISTINCT FROM OLD.account_status
       OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
       OR NEW.blood_bank_id IS DISTINCT FROM OLD.blood_bank_id
       OR NEW.ambulance_provider_id IS DISTINCT FROM OLD.ambulance_provider_id THEN
      RAISE EXCEPTION 'Account role, status, and provider links are managed by trusted workflows';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      RAISE EXCEPTION 'Provider verification status is managed by the platform review workflow';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_account_state ON public.users;
CREATE TRIGGER guard_user_account_state BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_account_state();
DROP TRIGGER IF EXISTS guard_hospital_account_state ON public.hospitals;
CREATE TRIGGER guard_hospital_account_state BEFORE UPDATE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_account_state();
DROP TRIGGER IF EXISTS guard_blood_bank_account_state ON public.blood_banks;
CREATE TRIGGER guard_blood_bank_account_state BEFORE UPDATE ON public.blood_banks
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_account_state();
DROP TRIGGER IF EXISTS guard_ambulance_provider_account_state ON public.ambulance_providers;
CREATE TRIGGER guard_ambulance_provider_account_state BEFORE UPDATE ON public.ambulance_providers
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_account_state();

-- Mark a public provider signup pending atomically after the existing signup trigger creates
-- its provider and profile. Inactive facilities are excluded by existing directory/matching logic.
CREATE OR REPLACE FUNCTION public.queue_provider_signup_for_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_user public.users; v_kind TEXT; v_provider_id UUID;
BEGIN
  IF lower(trim(COALESCE(NEW.raw_user_meta_data->>'role',''))) NOT IN ('hospital_admin','blood_bank_admin','ambulance_admin') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_user FROM public.users WHERE user_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider signup did not create its authoritative profile'; END IF;

  PERFORM set_config('lifelink.provider_account_transition','on',true);
  IF v_user.role::text='hospital_admin' AND v_user.hospital_id IS NOT NULL THEN
    v_kind := 'hospital'; v_provider_id := v_user.hospital_id;
    UPDATE public.hospitals SET verification_status='pending', status='Inactive', updated_at=now()
      WHERE hospital_id=v_provider_id;
  ELSIF v_user.role::text='blood_bank_admin' AND v_user.blood_bank_id IS NOT NULL THEN
    v_kind := 'blood_bank'; v_provider_id := v_user.blood_bank_id;
    UPDATE public.blood_banks SET verification_status='pending', status='Inactive', updated_at=now()
      WHERE blood_bank_id=v_provider_id;
  ELSIF v_user.role::text='ambulance_admin' AND v_user.ambulance_provider_id IS NOT NULL THEN
    v_kind := 'ambulance'; v_provider_id := v_user.ambulance_provider_id;
    UPDATE public.ambulance_providers SET verification_status='pending', status='Inactive', updated_at=now()
      WHERE provider_id=v_provider_id;
  ELSE
    RAISE EXCEPTION 'Provider signup did not create its linked provider record';
  END IF;

  UPDATE public.users SET status=false, account_status='pending', updated_at=now() WHERE user_id=NEW.id;
  INSERT INTO public.provider_account_reviews(user_id,provider_kind,provider_id,action,reason,actor_id)
  VALUES(NEW.id,v_kind,v_provider_id,'pending','Provider registration is awaiting platform verification.',NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_provider_signup_for_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zzz_queue_provider_signup_for_review ON auth.users;
CREATE TRIGGER zzz_queue_provider_signup_for_review
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.queue_provider_signup_for_review();

CREATE OR REPLACE FUNCTION public.list_provider_accounts_for_review()
RETURNS TABLE (
  user_id UUID, full_name TEXT, email TEXT, role TEXT, account_status TEXT,
  provider_id UUID, provider_name TEXT, district TEXT, state TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.users;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE users.user_id=auth.uid();
  IF NOT FOUND OR v_actor.role::text <> 'platform_admin' OR v_actor.status IS DISTINCT FROM true OR v_actor.account_status <> 'active' THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  RETURN QUERY
    SELECT u.user_id,u.full_name,u.email,u.role::text,u.account_status,
      COALESCE(h.hospital_id,b.blood_bank_id,a.provider_id),
      COALESCE(h.hospital_name,b.blood_bank_name,a.provider_name),
      COALESCE(h.district,b.district,a.district),COALESCE(h.state,b.state,a.state),u.created_at
    FROM public.users u
    LEFT JOIN public.hospitals h ON h.hospital_id=u.hospital_id
    LEFT JOIN public.blood_banks b ON b.blood_bank_id=u.blood_bank_id
    LEFT JOIN public.ambulance_providers a ON a.provider_id=u.ambulance_provider_id
    WHERE u.role::text IN ('hospital_admin','blood_bank_admin','ambulance_admin')
    ORDER BY CASE u.account_status WHEN 'pending' THEN 0 WHEN 'suspended' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
      u.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_provider_accounts_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_provider_accounts_for_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_provider_account(p_user_id UUID,p_decision TEXT,p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.users; v_target public.users; v_provider_id UUID; v_kind TEXT; v_action TEXT; v_review_id UUID; v_provider_rows INTEGER;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE users.user_id=auth.uid();
  IF NOT FOUND OR v_actor.role::text <> 'platform_admin' OR v_actor.status IS DISTINCT FROM true OR v_actor.account_status <> 'active' THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'Administrators cannot review their own provider account'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('activate','suspend','revoke') THEN RAISE EXCEPTION 'Unsupported provider account decision'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A review reason between 3 and 500 characters is required';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.role::text NOT IN ('hospital_admin','blood_bank_admin','ambulance_admin') THEN
    RAISE EXCEPTION 'Provider account was not found';
  END IF;
  IF v_target.account_status='revoked' THEN RAISE EXCEPTION 'Revoked provider accounts cannot be reactivated'; END IF;
  IF v_target.account_status='pending' AND p_decision='suspend' THEN
    v_action := 'suspended';
  ELSIF p_decision='activate' THEN v_action := 'activated';
  ELSIF p_decision='suspend' THEN v_action := 'suspended';
  ELSE v_action := 'revoked'; END IF;

  IF v_target.role::text='hospital_admin' THEN
    v_kind:='hospital'; v_provider_id:=v_target.hospital_id;
  ELSIF v_target.role::text='blood_bank_admin' THEN
    v_kind:='blood_bank'; v_provider_id:=v_target.blood_bank_id;
  ELSE
    v_kind:='ambulance'; v_provider_id:=v_target.ambulance_provider_id;
  END IF;
  IF v_provider_id IS NULL AND p_decision='activate' THEN
    RAISE EXCEPTION 'Provider account has no linked facility; repair the profile before activation';
  END IF;

  PERFORM set_config('lifelink.provider_account_transition','on',true);
  UPDATE public.users SET account_status=CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
    status=(p_decision='activate'),updated_at=now() WHERE user_id=p_user_id;
  IF v_provider_id IS NULL THEN
    NULL; -- Suspensions and revocations still work for orphaned legacy accounts.
  ELSIF v_kind='hospital' THEN
    UPDATE public.hospitals SET verification_status=CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
      status=CASE WHEN p_decision='activate' THEN 'Active' ELSE 'Inactive' END,updated_at=now() WHERE hospital_id=v_provider_id;
  ELSIF v_kind='blood_bank' THEN
    UPDATE public.blood_banks SET verification_status=CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
      status=CASE WHEN p_decision='activate' THEN 'Active' ELSE 'Inactive' END,updated_at=now() WHERE blood_bank_id=v_provider_id;
  ELSE
    UPDATE public.ambulance_providers SET verification_status=CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
      status=CASE WHEN p_decision='activate' THEN 'Active' ELSE 'Inactive' END,updated_at=now() WHERE provider_id=v_provider_id;
  END IF;
  IF v_provider_id IS NOT NULL THEN
    GET DIAGNOSTICS v_provider_rows = ROW_COUNT;
    IF v_provider_rows <> 1 THEN RAISE EXCEPTION 'Linked provider record was not updated'; END IF;
  END IF;
  INSERT INTO public.provider_account_reviews(user_id,provider_kind,provider_id,action,reason,actor_id)
  VALUES(p_user_id,v_kind,v_provider_id,v_action,btrim(p_reason),auth.uid())
  RETURNING review_id INTO v_review_id;
  RETURN jsonb_build_object('user_id',p_user_id,'provider_kind',v_kind,'provider_id',v_provider_id,
    'account_status',CASE p_decision WHEN 'activate' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END,
    'review_id',v_review_id);
END;
$$;
REVOKE ALL ON FUNCTION public.review_provider_account(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_provider_account(UUID,TEXT,TEXT) TO authenticated;

COMMENT ON TABLE public.provider_account_reviews IS
  'Append-only platform-admin decisions and signup events for provider verification; not a clinical or hospital operational approval log.';
