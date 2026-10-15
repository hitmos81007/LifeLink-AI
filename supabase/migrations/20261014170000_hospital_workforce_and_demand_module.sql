-- Hospital operations workspace: invitation-backed staff access, workforce shifts,
-- aggregate demand observations, and dated supply-consumption records.
-- Staff invitations are single-use, expire after 7 days, and are bound to email.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'hospital_staff';

CREATE TABLE IF NOT EXISTS public.hospital_staff (
  staff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (length(btrim(email)) BETWEEN 5 AND 254),
  phone TEXT,
  department TEXT NOT NULL CHECK (length(btrim(department)) BETWEEN 2 AND 100),
  discipline TEXT NOT NULL CHECK (discipline IN ('Nurse','Physician','Surgeon','Anesthesiologist','Respiratory Therapist','Pharmacist','Technician','Support','Other')),
  skills TEXT[] NOT NULL DEFAULT '{}',
  contract_hours_per_week NUMERIC(5,2) NOT NULL CHECK (contract_hours_per_week BETWEEN 0 AND 168),
  employment_status TEXT NOT NULL DEFAULT 'invited' CHECK (employment_status IN ('invited','active','inactive')),
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hospital_staff_email_unique ON public.hospital_staff(hospital_id, lower(email));
CREATE INDEX IF NOT EXISTS hospital_staff_hospital_status_idx ON public.hospital_staff(hospital_id, employment_status, discipline);

CREATE TABLE IF NOT EXISTS public.hospital_staff_invites (
  invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL UNIQUE REFERENCES public.hospital_staff(staff_id) ON DELETE CASCADE,
  invite_code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hospital_staff_shifts (
  shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.hospital_staff(staff_id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours'),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','leave','unavailable')),
  shift_note TEXT,
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(coalesce(shift_note,'')) <= 300)
);
CREATE INDEX IF NOT EXISTS hospital_staff_shifts_hospital_start_idx ON public.hospital_staff_shifts(hospital_id, starts_at);

CREATE TABLE IF NOT EXISTS public.hospital_activity_daily (
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  emergency_visits INTEGER NOT NULL DEFAULT 0 CHECK (emergency_visits BETWEEN 0 AND 100000),
  admissions INTEGER NOT NULL DEFAULT 0 CHECK (admissions BETWEEN 0 AND 100000),
  procedures INTEGER NOT NULL DEFAULT 0 CHECK (procedures BETWEEN 0 AND 100000),
  outpatient_visits INTEGER NOT NULL DEFAULT 0 CHECK (outpatient_visits BETWEEN 0 AND 100000),
  entered_by UUID NOT NULL REFERENCES public.users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, activity_date)
);

CREATE TABLE IF NOT EXISTS public.hospital_supply_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('medicine','oxygen','other')),
  item_label TEXT NOT NULL CHECK (length(btrim(item_label)) BETWEEN 1 AND 120),
  quantity_used NUMERIC(12,2) NOT NULL CHECK (quantity_used > 0 AND quantity_used <= 1000000),
  unit TEXT NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (item_label !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'),
  CHECK (regexp_replace(item_label,'[^0-9]','','g') !~ '[0-9]{10,}')
);
CREATE INDEX IF NOT EXISTS hospital_supply_usage_history_idx ON public.hospital_supply_usage(hospital_id, used_at DESC, category, item_label);

CREATE OR REPLACE FUNCTION public.is_active_hospital_admin(p_hospital_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid()
    AND u.hospital_id = p_hospital_id AND u.role::text = 'hospital_admin'
    AND u.status IS TRUE AND u.account_status::text = 'active')
$$;
CREATE OR REPLACE FUNCTION public.is_active_hospital_staff(p_hospital_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid()
    AND u.hospital_id = p_hospital_id AND u.role::text = 'hospital_staff'
    AND u.status IS TRUE AND u.account_status::text = 'active')
$$;
REVOKE ALL ON FUNCTION public.is_active_hospital_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_hospital_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_hospital_admin(UUID), public.is_active_hospital_staff(UUID) TO authenticated;

ALTER TABLE public.hospital_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_supply_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospital_staff, public.hospital_staff_invites, public.hospital_staff_shifts, public.hospital_activity_daily, public.hospital_supply_usage FROM PUBLIC, anon;
GRANT SELECT ON public.hospital_staff, public.hospital_staff_shifts, public.hospital_activity_daily, public.hospital_supply_usage TO authenticated;
GRANT UPDATE (full_name, phone, department, discipline, skills, contract_hours_per_week, updated_at) ON public.hospital_staff TO authenticated;
GRANT INSERT ON public.hospital_staff_shifts, public.hospital_activity_daily, public.hospital_supply_usage TO authenticated;
GRANT UPDATE (starts_at, ends_at, status, shift_note) ON public.hospital_staff_shifts TO authenticated;
GRANT UPDATE (emergency_visits, admissions, procedures, outpatient_visits, entered_by, updated_at) ON public.hospital_activity_daily TO authenticated;

DROP POLICY IF EXISTS hospital_staff_admin_read ON public.hospital_staff;
CREATE POLICY hospital_staff_admin_read ON public.hospital_staff FOR SELECT TO authenticated USING (public.is_active_hospital_admin(hospital_id));
DROP POLICY IF EXISTS hospital_staff_self_read ON public.hospital_staff;
CREATE POLICY hospital_staff_self_read ON public.hospital_staff FOR SELECT TO authenticated USING (auth_user_id = auth.uid() AND public.is_active_hospital_staff(hospital_id));
DROP POLICY IF EXISTS hospital_staff_admin_update ON public.hospital_staff;
CREATE POLICY hospital_staff_admin_update ON public.hospital_staff FOR UPDATE TO authenticated USING (public.is_active_hospital_admin(hospital_id)) WITH CHECK (public.is_active_hospital_admin(hospital_id));

DROP POLICY IF EXISTS hospital_staff_invites_no_client_access ON public.hospital_staff_invites;
CREATE POLICY hospital_staff_invites_no_client_access ON public.hospital_staff_invites FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hospital_staff_shifts_admin_read ON public.hospital_staff_shifts;
CREATE POLICY hospital_staff_shifts_admin_read ON public.hospital_staff_shifts FOR SELECT TO authenticated USING (public.is_active_hospital_admin(hospital_id));
DROP POLICY IF EXISTS hospital_staff_shifts_self_read ON public.hospital_staff_shifts;
CREATE POLICY hospital_staff_shifts_self_read ON public.hospital_staff_shifts FOR SELECT TO authenticated USING (public.is_active_hospital_staff(hospital_id) AND EXISTS (
  SELECT 1 FROM public.hospital_staff s WHERE s.staff_id = hospital_staff_shifts.staff_id AND s.auth_user_id = auth.uid() AND s.hospital_id = hospital_staff_shifts.hospital_id
));
DROP POLICY IF EXISTS hospital_staff_shifts_admin_insert ON public.hospital_staff_shifts;
CREATE POLICY hospital_staff_shifts_admin_insert ON public.hospital_staff_shifts FOR INSERT TO authenticated WITH CHECK (
  public.is_active_hospital_admin(hospital_staff_shifts.hospital_id) AND created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.hospital_staff s WHERE s.staff_id = hospital_staff_shifts.staff_id AND s.hospital_id = hospital_staff_shifts.hospital_id
  )
);
DROP POLICY IF EXISTS hospital_staff_shifts_admin_update ON public.hospital_staff_shifts;
CREATE POLICY hospital_staff_shifts_admin_update ON public.hospital_staff_shifts FOR UPDATE TO authenticated USING (public.is_active_hospital_admin(hospital_id)) WITH CHECK (
  public.is_active_hospital_admin(hospital_id) AND EXISTS (
    SELECT 1 FROM public.hospital_staff s WHERE s.staff_id = hospital_staff_shifts.staff_id AND s.hospital_id = hospital_staff_shifts.hospital_id
  )
);

DROP POLICY IF EXISTS hospital_activity_facility_read ON public.hospital_activity_daily;
CREATE POLICY hospital_activity_facility_read ON public.hospital_activity_daily FOR SELECT TO authenticated USING (public.is_active_hospital_admin(hospital_id) OR public.is_active_hospital_staff(hospital_id));
DROP POLICY IF EXISTS hospital_activity_admin_insert ON public.hospital_activity_daily;
CREATE POLICY hospital_activity_admin_insert ON public.hospital_activity_daily FOR INSERT TO authenticated WITH CHECK (public.is_active_hospital_admin(hospital_id) AND entered_by = auth.uid());
DROP POLICY IF EXISTS hospital_activity_admin_update ON public.hospital_activity_daily;
CREATE POLICY hospital_activity_admin_update ON public.hospital_activity_daily FOR UPDATE TO authenticated USING (public.is_active_hospital_admin(hospital_id)) WITH CHECK (public.is_active_hospital_admin(hospital_id) AND entered_by = auth.uid());

DROP POLICY IF EXISTS hospital_supply_usage_facility_read ON public.hospital_supply_usage;
CREATE POLICY hospital_supply_usage_facility_read ON public.hospital_supply_usage FOR SELECT TO authenticated USING (public.is_active_hospital_admin(hospital_id) OR public.is_active_hospital_staff(hospital_id));
DROP POLICY IF EXISTS hospital_supply_usage_staff_insert ON public.hospital_supply_usage;
CREATE POLICY hospital_supply_usage_staff_insert ON public.hospital_supply_usage FOR INSERT TO authenticated WITH CHECK (
  recorded_by = auth.uid() AND (public.is_active_hospital_admin(hospital_id) OR public.is_active_hospital_staff(hospital_id))
);

CREATE OR REPLACE FUNCTION public.create_hospital_staff_invite(
  p_full_name TEXT, p_email TEXT, p_phone TEXT, p_department TEXT, p_discipline TEXT,
  p_skills TEXT[], p_contract_hours_per_week NUMERIC
) RETURNS TABLE(staff_id UUID, invite_code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth, pg_temp AS $$
DECLARE v_actor public.users; v_code TEXT; v_staff UUID; v_hospital UUID; v_expiry TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id = auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text <> 'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE OR v_actor.account_status::text <> 'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required to invite staff';
  END IF;
  IF length(btrim(coalesce(p_full_name,''))) NOT BETWEEN 2 AND 120 OR length(btrim(coalesce(p_email,''))) NOT BETWEEN 5 AND 254 OR position('@' IN p_email) < 2 THEN
    RAISE EXCEPTION 'Enter a valid staff name and email';
  END IF;
  IF length(btrim(coalesce(p_department,''))) NOT BETWEEN 2 AND 100 OR p_discipline NOT IN ('Nurse','Physician','Surgeon','Anesthesiologist','Respiratory Therapist','Pharmacist','Technician','Support','Other') THEN
    RAISE EXCEPTION 'Enter a valid department and staff discipline';
  END IF;
  IF p_contract_hours_per_week NOT BETWEEN 0 AND 168 OR coalesce(array_length(p_skills,1),0) > 30 OR EXISTS (SELECT 1 FROM unnest(coalesce(p_skills,'{}')) skill WHERE length(btrim(skill)) NOT BETWEEN 1 AND 60) THEN
    RAISE EXCEPTION 'Enter valid weekly hours and up to 30 short skill tags';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hospital_staff s WHERE s.hospital_id = v_actor.hospital_id AND lower(s.email) = lower(btrim(p_email))) THEN
    RAISE EXCEPTION 'A staff record for this email already exists at your hospital';
  END IF;
  v_code := encode(gen_random_bytes(32), 'hex');
  v_expiry := now() + interval '7 days';
  INSERT INTO public.hospital_staff(hospital_id,full_name,email,phone,department,discipline,skills,contract_hours_per_week,employment_status,created_by)
  VALUES(v_actor.hospital_id,btrim(p_full_name),lower(btrim(p_email)),nullif(btrim(coalesce(p_phone,'')),''),btrim(p_department),p_discipline,coalesce(p_skills,'{}'),p_contract_hours_per_week,'invited',auth.uid()) RETURNING hospital_staff.staff_id INTO v_staff;
  INSERT INTO public.hospital_staff_invites(staff_id,invite_code_hash,expires_at)
  VALUES(v_staff,encode(digest(v_code,'sha256'),'hex'),v_expiry);
  RETURN QUERY SELECT v_staff,v_code,v_expiry;
END $$;
REVOKE ALL ON FUNCTION public.create_hospital_staff_invite(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_hospital_staff_invite(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.reissue_hospital_staff_invite(p_staff_id UUID)
RETURNS TABLE(invite_code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth, pg_temp AS $$
DECLARE v_actor public.users; v_code TEXT; v_expiry TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text<>'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE OR v_actor.account_status::text<>'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required to reissue staff invites';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospital_staff s WHERE s.staff_id=p_staff_id AND s.hospital_id=v_actor.hospital_id AND s.auth_user_id IS NULL AND s.employment_status='invited') THEN
    RAISE EXCEPTION 'This staff record is not awaiting an account invitation';
  END IF;
  v_code:=encode(gen_random_bytes(32),'hex'); v_expiry:=now()+interval '7 days';
  UPDATE public.hospital_staff_invites i SET invite_code_hash=encode(digest(v_code,'sha256'),'hex'),expires_at=v_expiry,claimed_at=NULL
  WHERE i.staff_id=p_staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No invitation exists for this staff record'; END IF;
  RETURN QUERY SELECT v_code,v_expiry;
END $$;
REVOKE ALL ON FUNCTION public.reissue_hospital_staff_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reissue_hospital_staff_invite(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_hospital_staff_access(p_staff_id UUID, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor public.users; v_target public.hospital_staff;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text<>'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE OR v_actor.account_status::text<>'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required';
  END IF;
  SELECT * INTO v_target FROM public.hospital_staff WHERE staff_id=p_staff_id AND hospital_id=v_actor.hospital_id FOR UPDATE;
  IF NOT FOUND OR v_target.auth_user_id IS NULL THEN RAISE EXCEPTION 'A linked staff account is required to change access'; END IF;
  UPDATE public.hospital_staff SET employment_status=CASE WHEN p_active THEN 'active' ELSE 'inactive' END,updated_at=now() WHERE staff_id=p_staff_id;
  UPDATE public.users SET status=p_active,account_status=CASE WHEN p_active THEN 'active' ELSE 'suspended' END,updated_at=now() WHERE user_id=v_target.auth_user_id;
END $$;
REVOKE ALL ON FUNCTION public.set_hospital_staff_access(UUID,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hospital_staff_access(UUID,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_hospital_staff_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth, pg_temp AS $$
DECLARE v_code TEXT; v_invite RECORD;
BEGIN
  IF lower(trim(coalesce(NEW.raw_user_meta_data->>'role',''))) <> 'hospital_staff' THEN RETURN NEW; END IF;
  v_code := trim(coalesce(NEW.raw_user_meta_data->>'staff_invite_code',''));
  IF length(v_code) < 32 THEN RAISE EXCEPTION 'A valid hospital staff invitation code is required'; END IF;
  SELECT i.invite_id,i.staff_id,s.hospital_id INTO v_invite
  FROM public.hospital_staff_invites i JOIN public.hospital_staff s ON s.staff_id = i.staff_id
  WHERE i.invite_code_hash = encode(digest(v_code,'sha256'),'hex') AND i.claimed_at IS NULL AND i.expires_at > now()
    AND lower(s.email) = lower(NEW.email) AND s.employment_status = 'invited' FOR UPDATE OF i,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is expired, already used, or does not match this email'; END IF;
  NEW.raw_user_meta_data := (coalesce(NEW.raw_user_meta_data,'{}'::jsonb) - 'staff_invite_code') || jsonb_build_object('role','patient');
  NEW.raw_app_meta_data := coalesce(NEW.raw_app_meta_data,'{}'::jsonb) || jsonb_build_object(
    'hospital_staff_invite_id',v_invite.invite_id,'hospital_staff_id',v_invite.staff_id,'hospital_staff_hospital_id',v_invite.hospital_id
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aaa_prepare_hospital_staff_signup ON auth.users;
CREATE TRIGGER aaa_prepare_hospital_staff_signup BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.prepare_hospital_staff_signup();
REVOKE ALL ON FUNCTION public.prepare_hospital_staff_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_hospital_staff_signup() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.finalize_hospital_staff_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_invite UUID; v_staff UUID; v_hospital UUID;
BEGIN
  v_invite := nullif(NEW.raw_app_meta_data->>'hospital_staff_invite_id','')::uuid;
  IF v_invite IS NULL THEN RETURN NEW; END IF;
  v_staff := nullif(NEW.raw_app_meta_data->>'hospital_staff_id','')::uuid;
  v_hospital := nullif(NEW.raw_app_meta_data->>'hospital_staff_hospital_id','')::uuid;
  IF v_staff IS NULL OR v_hospital IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hospital_staff_invites i JOIN public.hospital_staff s ON s.staff_id=i.staff_id
    WHERE i.invite_id=v_invite AND i.staff_id=v_staff AND i.claimed_at IS NULL AND i.expires_at>now()
      AND s.hospital_id=v_hospital AND lower(s.email)=lower(NEW.email)
  ) THEN RAISE EXCEPTION 'Hospital staff invitation could not be finalized'; END IF;
  UPDATE public.users SET role='hospital_staff'::public.user_role,hospital_id=v_hospital,status=TRUE,account_status='active',updated_at=now()
  WHERE user_id=NEW.id AND role::text='patient';
  IF NOT FOUND THEN RAISE EXCEPTION 'Hospital staff profile could not be created'; END IF;
  UPDATE public.hospital_staff SET auth_user_id=NEW.id,employment_status='active',updated_at=now() WHERE staff_id=v_staff AND hospital_id=v_hospital;
  UPDATE public.hospital_staff_invites SET claimed_at=now() WHERE invite_id=v_invite;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzz_finalize_hospital_staff_signup ON auth.users;
CREATE TRIGGER zzz_finalize_hospital_staff_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.finalize_hospital_staff_signup();
REVOKE ALL ON FUNCTION public.finalize_hospital_staff_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_hospital_staff_signup() TO postgres, service_role;

COMMENT ON TABLE public.hospital_staff IS 'Hospital-owned workforce directory. No patient information is stored in staff records.';
COMMENT ON TABLE public.hospital_activity_daily IS 'Aggregate, non-identifying activity counts used for transparent operational demand signals.';
COMMENT ON TABLE public.hospital_supply_usage IS 'Recorded hospital supply consumption; projections are descriptive run rates, not procurement orders.';
