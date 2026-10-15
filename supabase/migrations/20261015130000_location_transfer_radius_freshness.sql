-- Add an explicit search radius and per-inventory freshness to donor discovery.
-- The one-argument authenticated lookup remains the authoritative source list.
BEGIN;

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
  IF p_max_distance_km IS NOT NULL AND (p_max_distance_km<1 OR p_max_distance_km>500) THEN
    RAISE EXCEPTION 'Maximum distance must be between 1 and 500 km, or null for any distance';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT source.*,
      CASE source.resource_type
        WHEN 'ICU Beds' THEN (
          SELECT COALESCE(i.updated_at,i.created_at) FROM public.icu_inventory i
          WHERE i.hospital_id=source.source_hospital_id
        )
        WHEN 'General Beds' THEN (
          SELECT COALESCE(i.updated_at,i.created_at) FROM public.general_bed_inventory i
          WHERE i.hospital_id=source.source_hospital_id
        )
        WHEN 'Oxygen' THEN (
          SELECT COALESCE(i.updated_at,i.created_at) FROM public.oxygen_inventory i
          WHERE i.hospital_id=source.source_hospital_id
            AND i.oxygen_type::TEXT=source.resource_name
            AND i.unit=source.resource_identity->>'unit'
        )
        WHEN 'Medicine' THEN (
          SELECT COALESCE(i.updated_at,i.created_at) FROM public.medicine_inventory i
          WHERE i.hospital_id=source.source_hospital_id
            AND i.medicine_name=source.resource_name
            AND i.category::TEXT=source.resource_identity->>'category'
            AND i.dosage=source.resource_identity->>'dosage'
            AND i.manufacturer IS NOT DISTINCT FROM source.resource_identity->>'manufacturer'
            AND i.unit=source.resource_identity->>'unit'
            AND i.expiry_date IS NOT DISTINCT FROM NULLIF(source.resource_identity->>'expiry_date','')::DATE
        )
        ELSE NULL::TIMESTAMPTZ
      END AS last_reported_at
    FROM public.find_nearby_transfer_sources(p_resource_type) source
  )
  SELECT c.source_hospital_id,c.hospital_name,c.hospital_code,c.district,c.state,
    c.distance_km,c.last_reported_at,c.resource_type,c.resource_name,c.resource_identity,
    c.transferable_quantity,c.unit
  FROM candidates c
  WHERE p_max_distance_km IS NULL OR c.distance_km<=p_max_distance_km
  ORDER BY c.distance_km NULLS LAST,c.state,c.district,c.hospital_name;
END;
$$;

REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources(TEXT,NUMERIC) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_transfer_sources(TEXT,NUMERIC) TO authenticated;
COMMIT;
