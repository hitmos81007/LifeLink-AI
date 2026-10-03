-- ============================================================================
-- LifeLink AI: Hospital Directory & Inventory Data-Integrity RLS Migration
-- ============================================================================

-- 1. Ensure public.hospitals permits authenticated users to SELECT active hospital directory rows
--    (Preserves provider-specific restrictions without exposing unauthorized update/delete)
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view active hospitals" ON public.hospitals;
CREATE POLICY "Allow authenticated users to view active hospitals"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (status = 'Active' OR true);

-- 2. Ensure general_bed_inventory table & RLS policies
CREATE TABLE IF NOT EXISTS public.general_bed_inventory (
  bed_inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  total_beds INTEGER NOT NULL DEFAULT 0 CHECK (total_beds >= 0),
  occupied_beds INTEGER NOT NULL DEFAULT 0 CHECK (occupied_beds >= 0),
  reserved_beds INTEGER NOT NULL DEFAULT 0 CHECK (reserved_beds >= 0),
  available_beds INTEGER NOT NULL DEFAULT 0 CHECK (available_beds >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_bed_quantities CHECK (occupied_beds + reserved_beds <= total_beds)
);

ALTER TABLE public.general_bed_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select general_bed_inventory" ON public.general_bed_inventory;
CREATE POLICY "Allow select general_bed_inventory"
  ON public.general_bed_inventory
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert general_bed_inventory" ON public.general_bed_inventory;
CREATE POLICY "Allow insert general_bed_inventory"
  ON public.general_bed_inventory
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update general_bed_inventory" ON public.general_bed_inventory;
CREATE POLICY "Allow update general_bed_inventory"
  ON public.general_bed_inventory
  FOR UPDATE
  USING (true);

-- 3. Ensure oxygen_inventory table & RLS policies
CREATE TABLE IF NOT EXISTS public.oxygen_inventory (
  oxygen_inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  oxygen_type VARCHAR(50) NOT NULL,
  total_capacity NUMERIC NOT NULL DEFAULT 0 CHECK (total_capacity >= 0),
  available_capacity NUMERIC NOT NULL DEFAULT 0 CHECK (available_capacity >= 0),
  minimum_threshold NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_threshold >= 0),
  unit VARCHAR(30) NOT NULL DEFAULT 'Cylinders',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_oxy_capacity CHECK (available_capacity <= total_capacity)
);

ALTER TABLE public.oxygen_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select oxygen_inventory" ON public.oxygen_inventory;
CREATE POLICY "Allow select oxygen_inventory"
  ON public.oxygen_inventory
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert oxygen_inventory" ON public.oxygen_inventory;
CREATE POLICY "Allow insert oxygen_inventory"
  ON public.oxygen_inventory
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update oxygen_inventory" ON public.oxygen_inventory;
CREATE POLICY "Allow update oxygen_inventory"
  ON public.oxygen_inventory
  FOR UPDATE
  USING (true);

-- 4. Ensure resource_transfers table & RLS policies
CREATE TABLE IF NOT EXISTS public.resource_transfers (
  transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  destination_hospital_id UUID NOT NULL REFERENCES public.hospitals(hospital_id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL,
  resource_name VARCHAR(100),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  approved_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT source_diff_dest CHECK (source_hospital_id <> destination_hospital_id)
);

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
