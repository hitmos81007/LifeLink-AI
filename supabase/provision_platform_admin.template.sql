-- Run only after the user has registered and confirmed the email address below.
-- This is a trusted one-time setup action. Replace the email and reason; never put a password or service key here.
BEGIN;

DO $$
DECLARE
  v_email TEXT := lower(trim('REPLACE_WITH_CONFIRMED_ADMIN_EMAIL'));
  v_reason TEXT := 'Initial platform administrator provisioned by the project owner.';
  v_user RECORD;
BEGIN
  IF v_email = '' OR v_email = 'replace_with_confirmed_admin_email' THEN
    RAISE EXCEPTION 'Replace the template email with the confirmed admin account email';
  END IF;
  SELECT user_id, role::text AS prior_role INTO v_user
  FROM public.users WHERE lower(email)=v_email FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No public.users profile found for that confirmed account'; END IF;
  IF v_user.prior_role NOT IN ('patient') THEN
    RAISE EXCEPTION 'Only a patient account can be promoted by this one-time template';
  END IF;

  UPDATE public.users SET role='platform_admin', status=true, account_status='active', updated_at=now()
  WHERE user_id=v_user.user_id;
  INSERT INTO public.platform_role_provisioning_audit(user_id,prior_role,new_role,reason)
  VALUES(v_user.user_id,v_user.prior_role,'platform_admin',v_reason);
END $$;

COMMIT;
