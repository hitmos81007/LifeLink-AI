-- ============================================================================
-- Resource Transfer Migration & Transactional Completion Function SQL
-- ============================================================================

-- 1. Ensure resource_transfers table exists with standard schema
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

-- Enable RLS
ALTER TABLE public.resource_transfers ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies
DROP POLICY IF EXISTS "Allow select resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow select resource_transfers" ON public.resource_transfers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow insert resource_transfers" ON public.resource_transfers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update resource_transfers" ON public.resource_transfers;
CREATE POLICY "Allow update resource_transfers" ON public.resource_transfers FOR UPDATE USING (true);


-- ============================================================================
-- 2. Transactional Stored Procedure for Resource Transfer Completion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_resource_transfer(
  p_transfer_id UUID,
  p_operator_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer public.resource_transfers;
BEGIN
  -- 1. Fetch current transfer row
  SELECT * INTO v_transfer
  FROM public.resource_transfers
  WHERE transfer_id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer ID % not found.', p_transfer_id;
  END IF;

  IF v_transfer.status = 'Completed' THEN
    RETURN true; -- Already completed
  END IF;

  -- 2. Deduct inventory from source & add to destination based on resource_type
  IF v_transfer.resource_type = 'ICU Beds' THEN
    -- Deduct from source ICU
    UPDATE public.icu_inventory
    SET available_icu_beds = GREATEST(0, available_icu_beds - v_transfer.quantity),
        updated_at = NOW()
    WHERE hospital_id = v_transfer.source_hospital_id;

    -- Add to destination ICU
    UPDATE public.icu_inventory
    SET available_icu_beds = available_icu_beds + v_transfer.quantity,
        updated_at = NOW()
    WHERE hospital_id = v_transfer.destination_hospital_id;

  ELSIF v_transfer.resource_type = 'General Beds' THEN
    -- Deduct from source General Beds
    UPDATE public.general_bed_inventory
    SET available_beds = GREATEST(0, available_beds - v_transfer.quantity),
        updated_at = NOW()
    WHERE hospital_id = v_transfer.source_hospital_id;

    -- Add to destination General Beds
    UPDATE public.general_bed_inventory
    SET available_beds = available_beds + v_transfer.quantity,
        updated_at = NOW()
    WHERE hospital_id = v_transfer.destination_hospital_id;

  ELSIF v_transfer.resource_type = 'Oxygen' THEN
    -- Deduct from source Oxygen
    UPDATE public.oxygen_inventory
    SET available_capacity = GREATEST(0, available_capacity - v_transfer.quantity),
        updated_at = NOW()
    WHERE hospital_id = v_transfer.source_hospital_id;

    -- Add to destination Oxygen
    UPDATE public.oxygen_inventory
    SET available_capacity = available_capacity + v_transfer.quantity,
        updated_at = NOW()
    WHERE hospital_id = v_transfer.destination_hospital_id;

  ELSIF v_transfer.resource_type = 'Medicine' THEN
    -- Deduct from source Medicine
    UPDATE public.medicine_inventory
    SET current_stock = GREATEST(0, current_stock - v_transfer.quantity),
        updated_at = NOW()
    WHERE hospital_id = v_transfer.source_hospital_id
      AND (medicine_name ILIKE v_transfer.resource_name OR v_transfer.resource_name IS NULL);

    -- Add to destination Medicine
    UPDATE public.medicine_inventory
    SET current_stock = current_stock + v_transfer.quantity,
        updated_at = NOW()
    WHERE hospital_id = v_transfer.destination_hospital_id
      AND (medicine_name ILIKE v_transfer.resource_name OR v_transfer.resource_name IS NULL);

  END IF;

  -- 3. Mark transfer as Completed with timestamp and operator
  UPDATE public.resource_transfers
  SET status = 'Completed',
      completed_at = NOW(),
      approved_by = COALESCE(p_operator_id, approved_by),
      updated_at = NOW()
  WHERE transfer_id = p_transfer_id;

  -- 4. Record Audit Log entry
  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_value,
    new_value,
    created_at
  )
  VALUES (
    p_operator_id,
    'RESOURCE_TRANSFER_COMPLETED',
    'resource_transfers',
    p_transfer_id::text,
    jsonb_build_object('status', v_transfer.status),
    jsonb_build_object(
      'status', 'Completed',
      'resource_type', v_transfer.resource_type,
      'quantity', v_transfer.quantity,
      'source_hospital_id', v_transfer.source_hospital_id,
      'destination_hospital_id', v_transfer.destination_hospital_id
    ),
    NOW()
  );

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in complete_resource_transfer: %', SQLERRM;
    RETURN false;
END;
$$;
