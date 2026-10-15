-- Conflict-safe, hospital-scoped OR rooms, pseudonymous cases, proposals and bookings.
-- Requires 20261014170000_hospital_workforce_and_demand_module.sql.
-- Do not apply this file to a legacy/live project until its schema baseline is reconciled.

DO $$
BEGIN
  IF to_regclass('public.hospital_staff') IS NULL OR to_regclass('public.hospital_staff_shifts') IS NULL OR
     to_regprocedure('public.is_active_hospital_admin(uuid)') IS NULL OR
     to_regprocedure('public.is_active_hospital_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply and verify the hospital workforce migration before the OR scheduling migration';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hospital_operating_rooms (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  room_code TEXT NOT NULL CHECK (length(btrim(room_code)) BETWEEN 1 AND 24),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 80),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance','closed')),
  operating_minutes_per_day INTEGER NOT NULL DEFAULT 1440 CHECK (operating_minutes_per_day BETWEEN 0 AND 1440),
  turnaround_minutes INTEGER NOT NULL DEFAULT 30 CHECK (turnaround_minutes BETWEEN 0 AND 360),
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hospital_or_room_code_unique
  ON public.hospital_operating_rooms(hospital_id, lower(room_code));
CREATE INDEX IF NOT EXISTS hospital_or_rooms_scope_status_idx
  ON public.hospital_operating_rooms(hospital_id, status, room_code);

CREATE TABLE IF NOT EXISTS public.hospital_procedure_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  case_code TEXT NOT NULL UNIQUE,
  procedure_category TEXT NOT NULL CHECK (procedure_category IN ('general','orthopaedic','obstetric','cardiac','neurosurgical','urology','ophthalmology','other')),
  planned_duration_minutes INTEGER NOT NULL CHECK (planned_duration_minutes BETWEEN 15 AND 1440),
  required_room_capabilities TEXT[] NOT NULL DEFAULT '{}',
  required_staff_skills TEXT[] NOT NULL DEFAULT '{}',
  required_staff_roles TEXT[] NOT NULL DEFAULT ARRAY['surgeon','anesthesia','nurse']::TEXT[],
  scheduling_class TEXT NOT NULL DEFAULT 'elective' CHECK (scheduling_class IN ('elective')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','scheduled','completed','cancelled')),
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (required_staff_roles @> ARRAY['surgeon','anesthesia','nurse']::TEXT[]),
  CHECK (cardinality(required_room_capabilities) <= 20 AND cardinality(required_staff_skills) <= 20)
);
CREATE INDEX IF NOT EXISTS hospital_procedure_cases_scope_status_idx
  ON public.hospital_procedure_cases(hospital_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hospital_or_bookings (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.hospital_operating_rooms(room_id) ON DELETE RESTRICT,
  case_id UUID NOT NULL UNIQUE REFERENCES public.hospital_procedure_cases(case_id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  turnaround_minutes INTEGER NOT NULL CHECK (turnaround_minutes BETWEEN 0 AND 360),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','in_progress','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES public.users(user_id),
  confirmed_by UUID REFERENCES public.users(user_id),
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours'),
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS hospital_or_bookings_scope_time_idx
  ON public.hospital_or_bookings(hospital_id, starts_at, status);
ALTER TABLE public.hospital_or_bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.hospital_or_bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS hospital_or_bookings_room_time_idx
  ON public.hospital_or_bookings(room_id, starts_at, ends_at) WHERE status IN ('confirmed','in_progress');

CREATE TABLE IF NOT EXISTS public.hospital_or_booking_staff (
  booking_id UUID NOT NULL REFERENCES public.hospital_or_bookings(booking_id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.hospital_staff(staff_id) ON DELETE RESTRICT,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('surgeon','anesthesia','nurse','technician','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, staff_id)
);
CREATE INDEX IF NOT EXISTS hospital_or_booking_staff_person_idx
  ON public.hospital_or_booking_staff(staff_id, booking_id);

CREATE TABLE IF NOT EXISTS public.hospital_or_schedule_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.hospital_or_bookings(booking_id) ON DELETE RESTRICT,
  room_id UUID REFERENCES public.hospital_operating_rooms(room_id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES public.users(user_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('room_created','room_updated','proposal_created','booking_confirmed','booking_started','booking_completed','booking_cancelled')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 300),
  before_state JSONB,
  after_state JSONB NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (booking_id IS NOT NULL OR room_id IS NOT NULL)
);
ALTER TABLE public.hospital_or_schedule_events ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE public.hospital_or_schedule_events ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.hospital_operating_rooms(room_id) ON DELETE RESTRICT;
ALTER TABLE public.hospital_or_schedule_events DROP CONSTRAINT IF EXISTS hospital_or_schedule_events_event_type_check;
ALTER TABLE public.hospital_or_schedule_events ADD CONSTRAINT hospital_or_schedule_events_event_type_check
  CHECK (event_type IN ('room_created','room_updated','proposal_created','booking_confirmed','booking_started','booking_completed','booking_cancelled'));
ALTER TABLE public.hospital_or_schedule_events DROP CONSTRAINT IF EXISTS hospital_or_schedule_events_check;
ALTER TABLE public.hospital_or_schedule_events ADD CONSTRAINT hospital_or_schedule_events_booking_or_room_check
  CHECK (booking_id IS NOT NULL OR room_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS hospital_or_schedule_events_recent_idx
  ON public.hospital_or_schedule_events(hospital_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.is_hospital_or_booking_assignee(p_hospital_id UUID, p_booking_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hospital_staff s
    JOIN public.hospital_or_booking_staff a ON a.staff_id=s.staff_id AND a.hospital_id=s.hospital_id
    WHERE a.booking_id=p_booking_id AND a.hospital_id=p_hospital_id
      AND s.auth_user_id=auth.uid() AND s.employment_status='active'
      AND public.is_active_hospital_staff(p_hospital_id)
  )
$$;
REVOKE ALL ON FUNCTION public.is_hospital_or_booking_assignee(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_hospital_or_booking_assignee(UUID,UUID) TO authenticated;

ALTER TABLE public.hospital_operating_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_procedure_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_or_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_or_booking_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_or_schedule_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospital_operating_rooms, public.hospital_procedure_cases, public.hospital_or_bookings,
  public.hospital_or_booking_staff, public.hospital_or_schedule_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hospital_operating_rooms, public.hospital_procedure_cases, public.hospital_or_bookings,
  public.hospital_or_booking_staff, public.hospital_or_schedule_events TO authenticated;

DROP POLICY IF EXISTS hospital_or_rooms_admin_read ON public.hospital_operating_rooms;
CREATE POLICY hospital_or_rooms_admin_read ON public.hospital_operating_rooms FOR SELECT TO authenticated
USING (public.is_active_hospital_admin(hospital_id) OR EXISTS (
  SELECT 1 FROM public.hospital_or_bookings b
  WHERE b.room_id=hospital_operating_rooms.room_id
    AND public.is_hospital_or_booking_assignee(b.hospital_id,b.booking_id)
));
DROP POLICY IF EXISTS hospital_or_cases_admin_read ON public.hospital_procedure_cases;
CREATE POLICY hospital_or_cases_admin_read ON public.hospital_procedure_cases FOR SELECT TO authenticated
USING (public.is_active_hospital_admin(hospital_id) OR EXISTS (
  SELECT 1 FROM public.hospital_or_bookings b
  WHERE b.case_id=hospital_procedure_cases.case_id
    AND public.is_hospital_or_booking_assignee(b.hospital_id,b.booking_id)
));
DROP POLICY IF EXISTS hospital_or_bookings_admin_read ON public.hospital_or_bookings;
CREATE POLICY hospital_or_bookings_admin_read ON public.hospital_or_bookings FOR SELECT TO authenticated
USING (public.is_active_hospital_admin(hospital_id) OR public.is_hospital_or_booking_assignee(hospital_id,booking_id));
DROP POLICY IF EXISTS hospital_or_assignment_self_read ON public.hospital_or_booking_staff;
CREATE POLICY hospital_or_assignment_self_read ON public.hospital_or_booking_staff FOR SELECT TO authenticated
USING (
  (public.is_active_hospital_admin(hospital_id) AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.hospital_id=hospital_or_booking_staff.hospital_id
  )) OR EXISTS (
    SELECT 1 FROM public.hospital_staff s WHERE s.staff_id=hospital_or_booking_staff.staff_id
      AND s.auth_user_id=auth.uid() AND s.employment_status='active'
      AND public.is_active_hospital_staff(hospital_or_booking_staff.hospital_id)
  )
);
DROP POLICY IF EXISTS hospital_or_events_admin_read ON public.hospital_or_schedule_events;
CREATE POLICY hospital_or_events_admin_read ON public.hospital_or_schedule_events FOR SELECT TO authenticated
USING (public.is_active_hospital_admin(hospital_id) OR (booking_id IS NOT NULL AND public.is_hospital_or_booking_assignee(hospital_id,booking_id)));

DROP FUNCTION IF EXISTS public.save_hospital_operating_room(UUID,TEXT,TEXT,TEXT[],INTEGER,INTEGER,TEXT);
CREATE OR REPLACE FUNCTION public.save_hospital_operating_room(
  p_room_id UUID, p_room_code TEXT, p_display_name TEXT, p_capabilities TEXT[],
  p_operating_minutes_per_day INTEGER, p_turnaround_minutes INTEGER, p_status TEXT, p_reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor public.users; v_room public.hospital_operating_rooms; v_room_id UUID; v_before JSONB; v_event_type TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text<>'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE
     OR v_actor.account_status::text<>'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required';
  END IF;
  IF length(btrim(coalesce(p_room_code,''))) NOT BETWEEN 1 AND 24 OR
     length(btrim(coalesce(p_display_name,''))) NOT BETWEEN 2 AND 80 OR
     coalesce(p_operating_minutes_per_day,-1) NOT BETWEEN 0 AND 1440 OR
     coalesce(p_turnaround_minutes,-1) NOT BETWEEN 0 AND 360 OR
     p_status IS NULL OR p_status NOT IN ('available','maintenance','closed') OR p_reason IS NULL OR p_reason NOT IN ('routine_capacity_plan','staffing_coverage','room_readiness','schedule_conflict','other_operations') OR coalesce(cardinality(p_capabilities),0)>30 OR
     EXISTS (SELECT 1 FROM unnest(coalesce(p_capabilities,'{}')) x WHERE length(btrim(x)) NOT BETWEEN 1 AND 50) THEN
    RAISE EXCEPTION 'Check the room code, name, capabilities, status and turnaround time';
  END IF;
  IF p_room_id IS NULL THEN
    INSERT INTO public.hospital_operating_rooms(hospital_id,room_code,display_name,capabilities,status,operating_minutes_per_day,turnaround_minutes,created_by)
    VALUES(v_actor.hospital_id,btrim(p_room_code),btrim(p_display_name),coalesce(p_capabilities,'{}'),p_status,p_operating_minutes_per_day,p_turnaround_minutes,auth.uid())
    RETURNING room_id INTO v_room_id;
    v_event_type:='room_created';
  ELSE
    SELECT * INTO v_room FROM public.hospital_operating_rooms
      WHERE room_id=p_room_id AND hospital_id=v_actor.hospital_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operating room was not found for this hospital'; END IF;
    IF EXISTS (SELECT 1 FROM public.hospital_or_bookings b WHERE b.room_id=p_room_id
      AND b.status IN ('confirmed','in_progress') AND b.ends_at>now()) AND
      (p_status IS DISTINCT FROM v_room.status OR coalesce(p_capabilities,'{}') IS DISTINCT FROM v_room.capabilities OR
       p_operating_minutes_per_day IS DISTINCT FROM v_room.operating_minutes_per_day OR p_turnaround_minutes IS DISTINCT FROM v_room.turnaround_minutes) THEN
      RAISE EXCEPTION 'Cancel or complete active future bookings before changing this room’s availability, capabilities or capacity';
    END IF;
    v_before:=jsonb_build_object('room_code',v_room.room_code,'display_name',v_room.display_name,'capabilities',v_room.capabilities,'status',v_room.status,'operating_minutes_per_day',v_room.operating_minutes_per_day,'turnaround_minutes',v_room.turnaround_minutes);
    UPDATE public.hospital_operating_rooms SET room_code=btrim(p_room_code),display_name=btrim(p_display_name),
      capabilities=coalesce(p_capabilities,'{}'),status=p_status,operating_minutes_per_day=p_operating_minutes_per_day,
      turnaround_minutes=p_turnaround_minutes,updated_at=now()
    WHERE room_id=p_room_id AND hospital_id=v_actor.hospital_id RETURNING room_id INTO v_room_id;
    IF v_room_id IS NULL THEN RAISE EXCEPTION 'Operating room was not found for this hospital'; END IF;
    v_event_type:='room_updated';
  END IF;
  INSERT INTO public.hospital_or_schedule_events(hospital_id,room_id,actor_user_id,event_type,reason,before_state,after_state)
  SELECT v_actor.hospital_id,v_room_id,auth.uid(),v_event_type,p_reason,v_before,
    jsonb_build_object('room_code',r.room_code,'display_name',r.display_name,'capabilities',r.capabilities,'status',r.status,'operating_minutes_per_day',r.operating_minutes_per_day,'turnaround_minutes',r.turnaround_minutes)
  FROM public.hospital_operating_rooms r WHERE r.room_id=v_room_id;
  RETURN v_room_id;
END $$;
REVOKE ALL ON FUNCTION public.save_hospital_operating_room(UUID,TEXT,TEXT,TEXT[],INTEGER,INTEGER,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_hospital_operating_room(UUID,TEXT,TEXT,TEXT[],INTEGER,INTEGER,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_hospital_or_booking(
  p_room_id UUID, p_procedure_category TEXT, p_duration_minutes INTEGER, p_starts_at TIMESTAMPTZ,
  p_required_room_capabilities TEXT[], p_required_staff_skills TEXT[], p_staff_assignments JSONB, p_reason TEXT
) RETURNS TABLE(booking_id UUID, case_id UUID, status TEXT, version INTEGER, case_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor public.users; v_room public.hospital_operating_rooms; v_case UUID; v_booking UUID; v_code TEXT;
  v_assignment_count INTEGER; v_roles TEXT[]; v_staff_count INTEGER;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text<>'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE
     OR v_actor.account_status::text<>'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required';
  END IF;
  IF p_procedure_category IS NULL OR p_procedure_category NOT IN ('general','orthopaedic','obstetric','cardiac','neurosurgical','urology','ophthalmology','other') OR
     coalesce(p_duration_minutes,0) NOT BETWEEN 15 AND 1440 OR p_starts_at IS NULL OR
     p_starts_at < now()-interval '12 hours' OR p_reason IS NULL OR p_reason NOT IN ('routine_capacity_plan','staffing_coverage','room_readiness','schedule_conflict','other_operations') OR
     coalesce(cardinality(p_required_room_capabilities),0)>20 OR coalesce(cardinality(p_required_staff_skills),0)>20 THEN
    RAISE EXCEPTION 'Check the procedure category, duration, start time, team, capabilities and review reason';
  END IF;
  IF jsonb_typeof(p_staff_assignments) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A staff assignment list is required'; END IF;
  IF jsonb_array_length(p_staff_assignments)>20 THEN RAISE EXCEPTION 'A booking can include at most 20 staff'; END IF;
  SELECT * INTO v_room FROM public.hospital_operating_rooms WHERE room_id=p_room_id AND hospital_id=v_actor.hospital_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operating room was not found for this hospital'; END IF;
  IF v_room.status<>'available' THEN RAISE EXCEPTION 'This room is marked unavailable'; END IF;
  IF NOT (v_room.capabilities @> coalesce(p_required_room_capabilities,'{}')) THEN
    RAISE EXCEPTION 'The room does not meet the required capabilities';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT)
    WHERE x.staff_id IS NULL OR x.assignment_role IS NULL) THEN
    RAISE EXCEPTION 'Each assignment needs a staff member and role';
  END IF;
  SELECT array_agg(DISTINCT x.assignment_role) INTO v_roles
    FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT);
  SELECT count(*),count(DISTINCT x.staff_id) INTO v_assignment_count,v_staff_count
    FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT);
  IF v_assignment_count<3 OR v_assignment_count<>v_staff_count OR
     NOT (coalesce(v_roles,'{}') @> ARRAY['surgeon','anesthesia','nurse']::TEXT[]) OR
     EXISTS (SELECT 1 FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT)
       WHERE x.assignment_role NOT IN ('surgeon','anesthesia','nurse','technician','other')) THEN
    RAISE EXCEPTION 'Assign one distinct surgeon, anesthesia professional and nurse at minimum';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT)
    LEFT JOIN public.hospital_staff s ON s.staff_id=x.staff_id AND s.hospital_id=v_actor.hospital_id
    WHERE s.staff_id IS NULL OR s.employment_status<>'active' OR
      (x.assignment_role='surgeon' AND s.discipline NOT IN ('Surgeon','Physician')) OR
      (x.assignment_role='anesthesia' AND s.discipline<>'Anesthesiologist') OR
      (x.assignment_role='nurse' AND s.discipline<>'Nurse') OR
      (x.assignment_role='technician' AND s.discipline<>'Technician') OR
      NOT (s.skills @> coalesce(p_required_staff_skills,'{}'))
  ) THEN RAISE EXCEPTION 'Every assigned team member must be active at this hospital, qualified and carry the required skills'; END IF;

  v_code := 'OR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  INSERT INTO public.hospital_procedure_cases(hospital_id,case_code,procedure_category,planned_duration_minutes,
    required_room_capabilities,required_staff_skills,created_by)
  VALUES(v_actor.hospital_id,btrim(p_procedure_category),p_duration_minutes,coalesce(p_required_room_capabilities,'{}'),
    coalesce(p_required_staff_skills,'{}'),auth.uid()) RETURNING hospital_procedure_cases.case_id INTO v_case;
  INSERT INTO public.hospital_or_bookings(hospital_id,room_id,case_id,starts_at,ends_at,turnaround_minutes,created_by)
  VALUES(v_actor.hospital_id,p_room_id,v_case,p_starts_at,p_starts_at+make_interval(mins=>p_duration_minutes),v_room.turnaround_minutes,auth.uid())
  RETURNING hospital_or_bookings.booking_id INTO v_booking;
  INSERT INTO public.hospital_or_booking_staff(booking_id,hospital_id,staff_id,assignment_role)
  SELECT v_booking,v_actor.hospital_id,x.staff_id,x.assignment_role
  FROM jsonb_to_recordset(p_staff_assignments) AS x(staff_id UUID, assignment_role TEXT);
  INSERT INTO public.hospital_or_schedule_events(hospital_id,booking_id,actor_user_id,event_type,reason,after_state)
  VALUES(v_actor.hospital_id,v_booking,auth.uid(),'proposal_created',btrim(p_reason),
    jsonb_build_object('room_id',p_room_id,'case_id',v_case,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>p_duration_minutes),'status','proposed'));
  RETURN QUERY SELECT v_booking,v_case,'proposed'::TEXT,1,v_code;
END $$;
REVOKE ALL ON FUNCTION public.create_hospital_or_booking(UUID,TEXT,INTEGER,TIMESTAMPTZ,TEXT[],TEXT[],JSONB,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hospital_or_booking(UUID,TEXT,INTEGER,TIMESTAMPTZ,TEXT[],TEXT[],JSONB,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_hospital_or_booking(p_booking_id UUID,p_expected_version INTEGER,p_action TEXT,p_reason TEXT)
RETURNS TABLE(booking_id UUID,status TEXT,version INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor public.users; v_booking public.hospital_or_bookings; v_room public.hospital_operating_rooms;
  v_case public.hospital_procedure_cases; v_assignment_count INTEGER; v_reason TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id=auth.uid() FOR SHARE;
  IF NOT FOUND OR v_actor.role::text<>'hospital_admin' OR v_actor.status IS DISTINCT FROM TRUE
     OR v_actor.account_status::text<>'active' OR v_actor.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital administrator is required';
  END IF;
  v_reason:=btrim(coalesce(p_reason,''));
  IF v_reason NOT IN ('routine_capacity_plan','staffing_coverage','room_readiness','schedule_conflict','other_operations') OR p_action IS NULL OR p_action NOT IN ('confirm','cancel','start','complete') THEN
    RAISE EXCEPTION 'Choose a valid schedule action and provide a reason';
  END IF;
  SELECT * INTO v_booking FROM public.hospital_or_bookings
    WHERE hospital_or_bookings.booking_id=p_booking_id AND hospital_or_bookings.hospital_id=v_actor.hospital_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking was not found for this hospital'; END IF;
  IF v_booking.version<>p_expected_version THEN RAISE EXCEPTION 'Booking changed since it was loaded; refresh and review the latest schedule'; END IF;
  IF p_action='cancel' THEN
    IF v_booking.status NOT IN ('proposed','confirmed') THEN RAISE EXCEPTION 'Only proposed or future confirmed bookings can be cancelled'; END IF;
    UPDATE public.hospital_or_bookings SET status='cancelled',version=version+1,updated_at=now() WHERE hospital_or_bookings.booking_id=p_booking_id RETURNING * INTO v_booking;
    UPDATE public.hospital_procedure_cases SET status='cancelled',updated_at=now() WHERE hospital_procedure_cases.case_id=v_booking.case_id;
    INSERT INTO public.hospital_or_schedule_events(hospital_id,booking_id,actor_user_id,event_type,reason,before_state,after_state)
    VALUES(v_booking.hospital_id,p_booking_id,auth.uid(),'booking_cancelled',v_reason,jsonb_build_object('status','proposed/confirmed','version',p_expected_version),jsonb_build_object('status',v_booking.status,'version',v_booking.version));
    RETURN QUERY SELECT v_booking.booking_id,v_booking.status,v_booking.version; RETURN;
  END IF;
  IF p_action IN ('start','complete') THEN
    IF (p_action='start' AND v_booking.status<>'confirmed') OR (p_action='complete' AND v_booking.status<>'in_progress') THEN
      RAISE EXCEPTION 'Only confirmed bookings can start, and only in-progress bookings can complete';
    END IF;
    IF p_action='start' THEN
      UPDATE public.hospital_or_bookings SET status='in_progress',started_at=now(),version=version+1,updated_at=now()
        WHERE hospital_or_bookings.booking_id=p_booking_id RETURNING * INTO v_booking;
      INSERT INTO public.hospital_or_schedule_events(hospital_id,booking_id,actor_user_id,event_type,reason,before_state,after_state)
      VALUES(v_booking.hospital_id,p_booking_id,auth.uid(),'booking_started',v_reason,jsonb_build_object('status','confirmed','version',p_expected_version),jsonb_build_object('status',v_booking.status,'version',v_booking.version,'started_at',v_booking.started_at));
    ELSE
      UPDATE public.hospital_or_bookings SET status='completed',completed_at=now(),version=version+1,updated_at=now()
        WHERE hospital_or_bookings.booking_id=p_booking_id RETURNING * INTO v_booking;
      UPDATE public.hospital_procedure_cases SET status='completed',updated_at=now() WHERE hospital_procedure_cases.case_id=v_booking.case_id;
      INSERT INTO public.hospital_or_schedule_events(hospital_id,booking_id,actor_user_id,event_type,reason,before_state,after_state)
      VALUES(v_booking.hospital_id,p_booking_id,auth.uid(),'booking_completed',v_reason,jsonb_build_object('status','in_progress','version',p_expected_version),jsonb_build_object('status',v_booking.status,'version',v_booking.version,'completed_at',v_booking.completed_at));
    END IF;
    RETURN QUERY SELECT v_booking.booking_id,v_booking.status,v_booking.version; RETURN;
  END IF;
  IF v_booking.status<>'proposed' THEN RAISE EXCEPTION 'Only a proposed booking can be confirmed'; END IF;
  SELECT * INTO v_room FROM public.hospital_operating_rooms WHERE room_id=v_booking.room_id AND hospital_id=v_actor.hospital_id FOR UPDATE;
  SELECT * INTO v_case FROM public.hospital_procedure_cases WHERE case_id=v_booking.case_id AND hospital_id=v_actor.hospital_id FOR UPDATE;
  IF v_room.status<>'available' THEN RAISE EXCEPTION 'Room is unavailable; choose an available room and replan'; END IF;
  IF NOT (v_room.capabilities @> v_case.required_room_capabilities) THEN RAISE EXCEPTION 'Room capability changed; replan this case'; END IF;
  IF v_booking.turnaround_minutes<>v_room.turnaround_minutes THEN RAISE EXCEPTION 'Room turnaround changed after proposal; refresh and create a new proposal'; END IF;
  IF v_booking.starts_at<now() THEN RAISE EXCEPTION 'A past booking cannot be confirmed'; END IF;

  -- Lock assigned workforce records in a stable order so concurrent bookings on different rooms
  -- cannot both pass the staff-overlap check.
  PERFORM s.staff_id FROM public.hospital_staff s JOIN public.hospital_or_booking_staff a ON a.staff_id=s.staff_id
    WHERE a.booking_id=p_booking_id AND a.hospital_id=v_actor.hospital_id ORDER BY s.staff_id FOR UPDATE OF s;
  PERFORM sh.shift_id FROM public.hospital_staff_shifts sh JOIN public.hospital_or_booking_staff a ON a.staff_id=sh.staff_id
    WHERE a.booking_id=p_booking_id AND a.hospital_id=v_actor.hospital_id AND sh.hospital_id=v_actor.hospital_id
      AND sh.status='confirmed' AND sh.starts_at<=v_booking.starts_at AND sh.ends_at>=v_booking.ends_at
    ORDER BY sh.shift_id FOR UPDATE OF sh;
  SELECT count(*) INTO v_assignment_count FROM public.hospital_or_booking_staff WHERE hospital_or_booking_staff.booking_id=p_booking_id;
  IF v_assignment_count<3 OR NOT EXISTS (SELECT 1 FROM public.hospital_or_booking_staff WHERE hospital_or_booking_staff.booking_id=p_booking_id AND assignment_role='surgeon') OR
     NOT EXISTS (SELECT 1 FROM public.hospital_or_booking_staff WHERE hospital_or_booking_staff.booking_id=p_booking_id AND assignment_role='anesthesia') OR
     NOT EXISTS (SELECT 1 FROM public.hospital_or_booking_staff WHERE hospital_or_booking_staff.booking_id=p_booking_id AND assignment_role='nurse') THEN
    RAISE EXCEPTION 'A distinct surgeon, anesthesia professional and nurse are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hospital_or_booking_staff a JOIN public.hospital_staff s ON s.staff_id=a.staff_id
    WHERE a.booking_id=p_booking_id AND (s.hospital_id<>v_actor.hospital_id OR s.employment_status<>'active' OR
      (a.assignment_role='surgeon' AND s.discipline NOT IN ('Surgeon','Physician')) OR
      (a.assignment_role='anesthesia' AND s.discipline<>'Anesthesiologist') OR
      (a.assignment_role='nurse' AND s.discipline<>'Nurse') OR
      (a.assignment_role='technician' AND s.discipline<>'Technician') OR
      NOT (s.skills @> v_case.required_staff_skills))
  ) THEN RAISE EXCEPTION 'Assigned staff are no longer active, qualified or skilled for this case'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.hospital_or_booking_staff a
    WHERE a.booking_id=p_booking_id AND NOT EXISTS (
      SELECT 1 FROM public.hospital_staff_shifts sh WHERE sh.staff_id=a.staff_id AND sh.hospital_id=v_actor.hospital_id
        AND sh.status='confirmed' AND sh.starts_at<=v_booking.starts_at AND sh.ends_at>=v_booking.ends_at
    )
  ) THEN RAISE EXCEPTION 'Every assigned team member needs a confirmed shift covering the full procedure'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.hospital_or_bookings b
    WHERE b.room_id=v_booking.room_id AND b.booking_id<>p_booking_id AND b.status IN ('confirmed','in_progress')
      AND b.starts_at < v_booking.ends_at + make_interval(mins=>v_booking.turnaround_minutes)
      AND b.ends_at + make_interval(mins=>b.turnaround_minutes) > v_booking.starts_at
  ) THEN RAISE EXCEPTION 'Room time overlaps another confirmed booking or its turnaround period'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.hospital_or_booking_staff mine
    JOIN public.hospital_or_booking_staff other_team ON other_team.staff_id=mine.staff_id AND other_team.booking_id<>mine.booking_id
    JOIN public.hospital_or_bookings other_booking ON other_booking.booking_id=other_team.booking_id
    WHERE mine.booking_id=p_booking_id AND other_booking.status IN ('confirmed','in_progress')
      AND other_booking.starts_at<v_booking.ends_at AND other_booking.ends_at>v_booking.starts_at
  ) THEN RAISE EXCEPTION 'A team member is already assigned to an overlapping confirmed procedure'; END IF;

  UPDATE public.hospital_or_bookings SET status='confirmed',version=version+1,confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now()
    WHERE hospital_or_bookings.booking_id=p_booking_id RETURNING * INTO v_booking;
  UPDATE public.hospital_procedure_cases SET status='scheduled',updated_at=now() WHERE hospital_procedure_cases.case_id=v_booking.case_id;
  INSERT INTO public.hospital_or_schedule_events(hospital_id,booking_id,actor_user_id,event_type,reason,before_state,after_state)
  VALUES(v_booking.hospital_id,p_booking_id,auth.uid(),'booking_confirmed',v_reason,
    jsonb_build_object('status','proposed','version',p_expected_version),jsonb_build_object('status',v_booking.status,'version',v_booking.version,'confirmed_at',v_booking.confirmed_at));
  RETURN QUERY SELECT v_booking.booking_id,v_booking.status,v_booking.version;
END $$;
REVOKE ALL ON FUNCTION public.transition_hospital_or_booking(UUID,INTEGER,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_hospital_or_booking(UUID,INTEGER,TEXT,TEXT) TO authenticated;

COMMENT ON TABLE public.hospital_procedure_cases IS 'Hospital-scoped pseudonymous elective procedure demand. Contains no patient identity or clinical notes.';
COMMENT ON TABLE public.hospital_or_bookings IS 'Proposed/confirmed room schedule; confirmation rechecks room, turnaround, staff skills, shifts and overlap transactionally.';
COMMENT ON TABLE public.hospital_or_schedule_events IS 'Append-only hospital-admin OR proposal, confirmation and cancellation evidence.';
