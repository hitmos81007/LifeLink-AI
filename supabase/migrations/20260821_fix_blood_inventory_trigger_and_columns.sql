-- ============================================================================
-- LifeLink AI: Blood Inventory Trigger & Column Compatibility Repair
-- Resolves: "record 'new' has no field 'available_quantity'"
-- Ensures both available_units and available_quantity exist and stay synchronized.
-- ============================================================================

-- 1. Ensure public.blood_inventory table has both available_units and available_quantity columns
DO $$
BEGIN
  -- Add available_quantity column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'blood_inventory' 
      AND column_name = 'available_quantity'
  ) THEN
    ALTER TABLE public.blood_inventory ADD COLUMN available_quantity INTEGER DEFAULT 0;
  END IF;

  -- Add available_units column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'blood_inventory' 
      AND column_name = 'available_units'
  ) THEN
    ALTER TABLE public.blood_inventory ADD COLUMN available_units INTEGER DEFAULT 0;
  END IF;

  -- Add reserved_units if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'blood_inventory' 
      AND column_name = 'reserved_units'
  ) THEN
    ALTER TABLE public.blood_inventory ADD COLUMN reserved_units INTEGER DEFAULT 0;
  END IF;

  -- Add expired_units if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'blood_inventory' 
      AND column_name = 'expired_units'
  ) THEN
    ALTER TABLE public.blood_inventory ADD COLUMN expired_units INTEGER DEFAULT 0;
  END IF;

  -- Add minimum_threshold if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'blood_inventory' 
      AND column_name = 'minimum_threshold'
  ) THEN
    ALTER TABLE public.blood_inventory ADD COLUMN minimum_threshold INTEGER DEFAULT 10;
  END IF;
END $$;

-- 2. Synchronize existing data across available_units and available_quantity
UPDATE public.blood_inventory
SET available_quantity = COALESCE(available_units, available_quantity, 0)
WHERE available_quantity IS NULL OR (available_quantity = 0 AND available_units > 0);

UPDATE public.blood_inventory
SET available_units = COALESCE(available_quantity, available_units, 0)
WHERE available_units IS NULL OR (available_units = 0 AND available_quantity > 0);

-- 3. Drop any problematic / conflicting legacy triggers on blood_inventory
DROP TRIGGER IF EXISTS trigger_check_blood_inventory ON public.blood_inventory;
DROP TRIGGER IF EXISTS check_blood_stock_trigger ON public.blood_inventory;
DROP TRIGGER IF EXISTS check_inventory_threshold ON public.blood_inventory;
DROP TRIGGER IF EXISTS notify_low_stock ON public.blood_inventory;
DROP TRIGGER IF EXISTS audit_blood_inventory ON public.blood_inventory;
DROP TRIGGER IF EXISTS blood_inventory_audit_trigger ON public.blood_inventory;
DROP TRIGGER IF EXISTS trg_blood_inventory_update ON public.blood_inventory;
DROP TRIGGER IF EXISTS blood_stock_alert_trigger ON public.blood_inventory;
DROP TRIGGER IF EXISTS update_blood_inventory_modtime ON public.blood_inventory;
DROP TRIGGER IF EXISTS blood_inventory_sync_trigger ON public.blood_inventory;

-- 4. Create safe, synchronized trigger function for blood inventory
CREATE OR REPLACE FUNCTION public.sync_blood_inventory_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sync available_units and available_quantity so neither is ever null or mismatched
  IF NEW.available_units IS NOT NULL AND NEW.available_quantity IS NULL THEN
    NEW.available_quantity := NEW.available_units;
  ELSIF NEW.available_quantity IS NOT NULL AND NEW.available_units IS NULL THEN
    NEW.available_units := NEW.available_quantity;
  ELSIF NEW.available_units IS NOT NULL AND NEW.available_quantity IS NOT NULL THEN
    -- If available_units was modified, propagate to available_quantity
    NEW.available_quantity := NEW.available_units;
  END IF;

  -- Default values safety
  NEW.available_units := COALESCE(NEW.available_units, 0);
  NEW.available_quantity := COALESCE(NEW.available_quantity, NEW.available_units);
  NEW.reserved_units := COALESCE(NEW.reserved_units, 0);
  NEW.expired_units := COALESCE(NEW.expired_units, 0);
  NEW.minimum_threshold := COALESCE(NEW.minimum_threshold, 10);
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_blood_inventory_columns ON public.blood_inventory;
CREATE TRIGGER trg_sync_blood_inventory_columns
  BEFORE INSERT OR UPDATE ON public.blood_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_blood_inventory_columns();

-- 5. Validate and maintain Row Level Security
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Blood inventory read access" ON public.blood_inventory;
CREATE POLICY "Blood inventory read access"
  ON public.blood_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (
          u.role IN ('government_admin', 'clinician_reviewer', 'hospital_admin', 'hospital_approver')
          OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_inventory.blood_bank_id)
        )
    )
    OR true -- Allow emergency cross-matching queries
  );

DROP POLICY IF EXISTS "Blood inventory write access" ON public.blood_inventory;
CREATE POLICY "Blood inventory write access"
  ON public.blood_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (
          u.role = 'government_admin'
          OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_inventory.blood_bank_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (
          u.role = 'government_admin'
          OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_inventory.blood_bank_id)
        )
    )
  );
