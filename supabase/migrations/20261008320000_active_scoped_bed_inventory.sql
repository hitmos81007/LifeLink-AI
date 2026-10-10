-- Bed availability feeds clinician allocations, transfers, and forecasts.
-- Require active accounts and facilities for all inventory access and writes.
BEGIN;

DO $$
DECLARE v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('icu_inventory','general_bed_inventory')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.icu_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_bed_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icu_inventory_read_active_scoped"
  ON public.icu_inventory FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND (u.role::text='government_admin'
        OR (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id=icu_inventory.hospital_id))
  ));
CREATE POLICY "icu_inventory_insert_active_own_hospital"
  ON public.icu_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=icu_inventory.hospital_id
  ));
CREATE POLICY "icu_inventory_update_active_own_hospital"
  ON public.icu_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=icu_inventory.hospital_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=icu_inventory.hospital_id
  ));

CREATE POLICY "general_bed_inventory_read_active_scoped"
  ON public.general_bed_inventory FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND (u.role::text='government_admin'
        OR (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id=general_bed_inventory.hospital_id))
  ));
CREATE POLICY "general_bed_inventory_insert_active_own_hospital"
  ON public.general_bed_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=general_bed_inventory.hospital_id
  ));
CREATE POLICY "general_bed_inventory_update_active_own_hospital"
  ON public.general_bed_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=general_bed_inventory.hospital_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id=u.hospital_id AND h.status='Active'
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role::text='hospital_admin' AND u.hospital_id=general_bed_inventory.hospital_id
  ));

COMMIT;
