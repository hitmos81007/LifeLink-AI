-- Immutable, hospital-scoped snapshots for the explainable resource-planning prototype.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hospital_resource_planning_scenarios (
  scenario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  scenario_name TEXT NOT NULL CHECK (length(btrim(scenario_name)) BETWEEN 1 AND 100),
  input_snapshot JSONB NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  result_snapshot JSONB NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hospital_resource_planning_scenarios_recent_idx
  ON public.hospital_resource_planning_scenarios(hospital_id, created_at DESC);

ALTER TABLE public.hospital_resource_planning_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospital_resource_planning_scenarios FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.hospital_resource_planning_scenarios TO authenticated;

DROP POLICY IF EXISTS hospital_resource_planning_scenarios_read_own_facility ON public.hospital_resource_planning_scenarios;
CREATE POLICY hospital_resource_planning_scenarios_read_own_facility
ON public.hospital_resource_planning_scenarios FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.user_id = auth.uid() AND u.hospital_id = hospital_resource_planning_scenarios.hospital_id
    AND u.role::text = 'hospital_admin' AND u.status IS TRUE AND u.account_status::text = 'active'
));

DROP POLICY IF EXISTS hospital_resource_planning_scenarios_insert_own_facility ON public.hospital_resource_planning_scenarios;
CREATE POLICY hospital_resource_planning_scenarios_insert_own_facility
ON public.hospital_resource_planning_scenarios FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.hospital_id = hospital_resource_planning_scenarios.hospital_id
      AND u.role::text = 'hospital_admin' AND u.status IS TRUE AND u.account_status::text = 'active'
  )
);

COMMENT ON TABLE public.hospital_resource_planning_scenarios IS
  'Immutable planning snapshots. Solver outputs are advisory prototype recommendations and never reserve or change resources.';

COMMIT;
