-- ============================================================================
-- AI Recommendations and Resource Transfers RLS Repair Migration
-- ============================================================================

-- 1. Ensure ai_recommendations table and RLS policies allow authenticated inserts & selects
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.patient_requests(request_id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  blood_bank_id UUID REFERENCES public.blood_banks(blood_bank_id) ON DELETE SET NULL,
  ambulance_id UUID REFERENCES public.ambulances(ambulance_id) ON DELETE SET NULL,
  distance_km NUMERIC NOT NULL DEFAULT 3.0,
  eta_minutes INTEGER NOT NULL DEFAULT 10,
  confidence_score INTEGER NOT NULL DEFAULT 85,
  recommendation_reason TEXT,
  accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select ai_recommendations" ON public.ai_recommendations;
CREATE POLICY "Allow select ai_recommendations"
  ON public.ai_recommendations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert ai_recommendations" ON public.ai_recommendations;
CREATE POLICY "Allow insert ai_recommendations"
  ON public.ai_recommendations
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update ai_recommendations" ON public.ai_recommendations;
CREATE POLICY "Allow update ai_recommendations"
  ON public.ai_recommendations
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Allow delete ai_recommendations" ON public.ai_recommendations;
CREATE POLICY "Allow delete ai_recommendations"
  ON public.ai_recommendations
  FOR DELETE
  USING (true);

-- 2. Ensure resource_transfers table has permissive RLS for operational routing
ALTER TABLE public.resource_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow select resource_transfers"
  ON public.resource_transfers
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow insert resource_transfers"
  ON public.resource_transfers
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow update resource_transfers"
  ON public.resource_transfers
  FOR UPDATE
  USING (true);
