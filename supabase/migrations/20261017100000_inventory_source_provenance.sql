-- Keep synthetic demo inventory distinguishable from unclassified legacy rows.
-- Authenticated creation or explicit update marks a row simulated; untouched
-- legacy rows remain unknown and are excluded from sharing and transfers.
BEGIN;

DO $$
DECLARE
  v_table TEXT;
  v_constraint TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'icu_inventory', 'general_bed_inventory', 'oxygen_inventory',
    'medicine_inventory', 'blood_inventory', 'ambulances'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT ''unknown''',
      v_table
    );
    v_constraint := v_table || '_source_type_check';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_constraint
        AND conrelid = format('public.%I', v_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (source_type IN (''seeded'', ''simulated'', ''unknown''))',
        v_table, v_constraint
      );
    END IF;
  END LOOP;
END;
$$;

-- Classify only records belonging to the reserved fictional demo directory.
UPDATE public.icu_inventory i SET source_type = 'seeded'
FROM public.hospitals h WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'unknown';
UPDATE public.general_bed_inventory i SET source_type = 'seeded'
FROM public.hospitals h WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'unknown';
UPDATE public.oxygen_inventory i SET source_type = 'seeded'
FROM public.hospitals h WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'unknown';
UPDATE public.medicine_inventory i SET source_type = 'seeded'
FROM public.hospitals h WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'unknown';
UPDATE public.blood_inventory i SET source_type = 'seeded'
FROM public.blood_banks b WHERE b.blood_bank_id = i.blood_bank_id
  AND b.blood_bank_code LIKE 'LL-DEMO-BANK-%' AND i.source_type = 'unknown';
UPDATE public.ambulances a SET source_type = 'seeded'
WHERE a.vehicle_number LIKE 'LL-DEMO-UNIT-%' AND a.source_type = 'unknown';

CREATE OR REPLACE FUNCTION public.set_inventory_source_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.source_type := 'simulated';
    ELSE
      NEW.source_type := COALESCE(NEW.source_type, 'unknown');
    END IF;
  ELSE
    -- An authenticated, authorized inventory edit is the operator's explicit
    -- confirmation of a legacy row. Preserve already-known provenance.
    IF OLD.source_type = 'unknown' AND auth.uid() IS NOT NULL THEN
      NEW.source_type := 'simulated';
    ELSE
      NEW.source_type := OLD.source_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_inventory_source_type() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'icu_inventory', 'general_bed_inventory', 'oxygen_inventory',
    'medicine_inventory', 'blood_inventory', 'ambulances'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_source_type ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_source_type BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_inventory_source_type()',
      v_table, v_table
    );
  END LOOP;
END;
$$;

-- Preserve the existing donor eligibility rules, but never offer an inventory
-- row whose origin is unknown or unverified.
DO $$
BEGIN
  IF to_regprocedure('public.find_nearby_transfer_sources_unfiltered(text)') IS NULL THEN
    ALTER FUNCTION public.find_nearby_transfer_sources(TEXT)
      RENAME TO find_nearby_transfer_sources_unfiltered;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources_unfiltered(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_nearby_transfer_sources(p_resource_type TEXT)
RETURNS TABLE (
  source_hospital_id UUID,
  hospital_name TEXT,
  hospital_code TEXT,
  district TEXT,
  state TEXT,
  distance_km NUMERIC,
  resource_type TEXT,
  resource_name TEXT,
  resource_identity JSONB,
  transferable_quantity NUMERIC,
  unit TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT candidate.source_hospital_id, candidate.hospital_name, candidate.hospital_code,
    candidate.district, candidate.state, candidate.distance_km, candidate.resource_type,
    candidate.resource_name, candidate.resource_identity, candidate.transferable_quantity,
    candidate.unit
  FROM public.find_nearby_transfer_sources_unfiltered(p_resource_type) candidate
  WHERE CASE candidate.resource_type
    WHEN 'ICU Beds' THEN EXISTS (
      SELECT 1 FROM public.icu_inventory i
      WHERE i.hospital_id = candidate.source_hospital_id
        AND i.source_type IN ('seeded','simulated')
    )
    WHEN 'General Beds' THEN EXISTS (
      SELECT 1 FROM public.general_bed_inventory i
      WHERE i.hospital_id = candidate.source_hospital_id
        AND i.source_type IN ('seeded','simulated')
    )
    WHEN 'Oxygen' THEN EXISTS (
      SELECT 1 FROM public.oxygen_inventory i
      WHERE i.hospital_id = candidate.source_hospital_id
        AND i.oxygen_type::TEXT = candidate.resource_name
        AND i.unit = candidate.unit
        AND i.source_type IN ('seeded','simulated')
    )
    WHEN 'Medicine' THEN EXISTS (
      SELECT 1 FROM public.medicine_inventory i
      WHERE i.hospital_id = candidate.source_hospital_id
        AND i.medicine_name = candidate.resource_name
        AND i.category::TEXT = candidate.resource_identity->>'category'
        AND i.dosage = candidate.resource_identity->>'dosage'
        AND i.manufacturer IS NOT DISTINCT FROM candidate.resource_identity->>'manufacturer'
        AND i.unit = candidate.unit
        AND i.source_type IN ('seeded','simulated')
    )
    ELSE FALSE
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_transfer_sources(TEXT) TO authenticated;

-- Keep the range/freshness contract while sourcing candidates from the
-- provenance-filtered one-argument function above.
CREATE OR REPLACE FUNCTION public.find_nearby_transfer_sources(
  p_resource_type TEXT,
  p_max_distance_km NUMERIC
)
RETURNS TABLE (
  source_hospital_id UUID,
  hospital_name TEXT,
  hospital_code TEXT,
  district TEXT,
  state TEXT,
  distance_km NUMERIC,
  last_reported_at TIMESTAMPTZ,
  resource_type TEXT,
  resource_name TEXT,
  resource_identity JSONB,
  transferable_quantity NUMERIC,
  unit TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_max_distance_km IS NOT NULL AND (p_max_distance_km < 1 OR p_max_distance_km > 500) THEN
    RAISE EXCEPTION 'Maximum distance must be between 1 and 500 km, or null for any distance';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT source.*,
      CASE source.resource_type
        WHEN 'ICU Beds' THEN (
          SELECT COALESCE(i.updated_at, i.created_at) FROM public.icu_inventory i
          WHERE i.hospital_id = source.source_hospital_id
            AND i.source_type IN ('seeded','simulated')
        )
        WHEN 'General Beds' THEN (
          SELECT COALESCE(i.updated_at, i.created_at) FROM public.general_bed_inventory i
          WHERE i.hospital_id = source.source_hospital_id
            AND i.source_type IN ('seeded','simulated')
        )
        WHEN 'Oxygen' THEN (
          SELECT COALESCE(i.updated_at, i.created_at) FROM public.oxygen_inventory i
          WHERE i.hospital_id = source.source_hospital_id
            AND i.oxygen_type::TEXT = source.resource_name
            AND i.unit = source.resource_identity->>'unit'
            AND i.source_type IN ('seeded','simulated')
        )
        WHEN 'Medicine' THEN (
          SELECT COALESCE(i.updated_at, i.created_at) FROM public.medicine_inventory i
          WHERE i.hospital_id = source.source_hospital_id
            AND i.medicine_name = source.resource_name
            AND i.category::TEXT = source.resource_identity->>'category'
            AND i.dosage = source.resource_identity->>'dosage'
            AND i.manufacturer IS NOT DISTINCT FROM source.resource_identity->>'manufacturer'
            AND i.unit = source.resource_identity->>'unit'
            AND i.expiry_date IS NOT DISTINCT FROM NULLIF(source.resource_identity->>'expiry_date','')::DATE
            AND i.source_type IN ('seeded','simulated')
        )
        ELSE NULL::TIMESTAMPTZ
      END AS last_reported_at
    FROM public.find_nearby_transfer_sources(p_resource_type) source
  )
  SELECT c.source_hospital_id,c.hospital_name,c.hospital_code,c.district,c.state,
    c.distance_km,c.last_reported_at,c.resource_type,c.resource_name,c.resource_identity,
    c.transferable_quantity,c.unit
  FROM candidates c
  WHERE p_max_distance_km IS NULL OR c.distance_km <= p_max_distance_km
  ORDER BY c.distance_km NULLS LAST,c.state,c.district,c.hospital_name;
END;
$$;
REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources(TEXT,NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_transfer_sources(TEXT,NUMERIC) TO authenticated;

-- Enforce the same provenance rule on the authoritative transfer write path,
-- including direct RPC calls that bypass the candidate-search UI.
CREATE OR REPLACE FUNCTION public.require_known_transfer_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_type TEXT;
BEGIN
  IF NEW.source_inventory_id IS NULL THEN
    RAISE EXCEPTION 'A transfer must reference a specific inventory row';
  END IF;

  IF NEW.resource_type::TEXT = 'ICU Beds' THEN
    SELECT source_type INTO v_source_type FROM public.icu_inventory
    WHERE icu_inventory_id = NEW.source_inventory_id AND hospital_id = NEW.source_hospital_id;
  ELSIF NEW.resource_type::TEXT = 'General Beds' THEN
    SELECT source_type INTO v_source_type FROM public.general_bed_inventory
    WHERE bed_inventory_id = NEW.source_inventory_id AND hospital_id = NEW.source_hospital_id;
  ELSIF NEW.resource_type::TEXT = 'Oxygen' THEN
    SELECT source_type INTO v_source_type FROM public.oxygen_inventory
    WHERE oxygen_inventory_id = NEW.source_inventory_id AND hospital_id = NEW.source_hospital_id;
  ELSIF NEW.resource_type::TEXT = 'Medicine' THEN
    SELECT source_type INTO v_source_type FROM public.medicine_inventory
    WHERE medicine_inventory_id = NEW.source_inventory_id AND hospital_id = NEW.source_hospital_id;
  ELSE
    RAISE EXCEPTION 'This resource type is not enabled for synthetic transfers';
  END IF;

  IF v_source_type IS NULL OR v_source_type NOT IN ('seeded','simulated') THEN
    RAISE EXCEPTION 'Only explicitly seeded or simulated inventory can be transferred';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_known_transfer_source() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_resource_transfer_known_source ON public.resource_transfers;
CREATE TRIGGER trg_resource_transfer_known_source
  BEFORE INSERT ON public.resource_transfers
  FOR EACH ROW EXECUTE FUNCTION public.require_known_transfer_source();

NOTIFY pgrst, 'reload schema';
COMMIT;
