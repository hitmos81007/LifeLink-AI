-- Add resource observation times to the restricted clinician candidate snapshot.
-- This preserves the minimal projection while allowing the UI to exclude stale data.
CREATE OR REPLACE FUNCTION public.get_clinician_review_network()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_result JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;

  SELECT jsonb_build_object(
    'hospitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id', h.hospital_id,
        'hospital_name', h.hospital_name,
        'address', h.address,
        'district', h.district,
        'latitude', h.latitude,
        'longitude', h.longitude,
        'trauma_center', h.trauma_center,
        'status', h.status,
        'available_icu_beds', COALESCE(icu.available_beds, 0),
        'icu_updated_at', icu.updated_at,
        'available_beds', COALESCE(general_beds.available_beds, 0),
        'beds_updated_at', general_beds.updated_at,
        'available_oxygen_records', COALESCE(oxygen.available_records, 0),
        'oxygen_updated_at', oxygen.updated_at
      ) ORDER BY h.hospital_name)
      FROM public.hospitals h
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(i.available_icu_beds) ELSE 0 END AS available_beds,
               CASE WHEN count(*) = 1 THEN max(i.updated_at) END AS updated_at
        FROM public.icu_inventory i WHERE i.hospital_id = h.hospital_id
      ) icu ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(b.available_beds) ELSE 0 END AS available_beds,
               CASE WHEN count(*) = 1 THEN max(b.updated_at) END AS updated_at
        FROM public.general_bed_inventory b WHERE b.hospital_id = h.hospital_id
      ) general_beds ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (
                 WHERE o.available_capacity > o.minimum_threshold
                   AND o.updated_at >= now() - interval '1 hour'
                   AND o.updated_at <= now()
               )::INTEGER AS available_records,
               min(o.updated_at) AS updated_at
        FROM public.oxygen_inventory o
        WHERE o.hospital_id = h.hospital_id
      ) oxygen ON true
      WHERE h.status = 'Active'
    ), '[]'::jsonb),
    'bloodBanks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'blood_bank_id', b.blood_bank_id,
        'blood_bank_name', b.blood_bank_name,
        'address', b.address,
        'district', b.district,
        'latitude', b.latitude,
        'longitude', b.longitude,
        'status', b.status,
        'blood_stock', COALESCE(stock.stock, '{}'::jsonb),
        'blood_thresholds', COALESCE(stock.thresholds, '{}'::jsonb),
        'blood_updated_at', COALESCE(stock.updated_at, '{}'::jsonb)
      ) ORDER BY b.blood_bank_name)
      FROM public.blood_banks b
      LEFT JOIN LATERAL (
        SELECT
          jsonb_object_agg(grouped.blood_group, grouped.available_units) AS stock,
          jsonb_object_agg(grouped.blood_group, grouped.minimum_threshold) AS thresholds,
          jsonb_object_agg(grouped.blood_group, grouped.updated_at) AS updated_at
        FROM (
          SELECT DISTINCT ON (bi.blood_group)
            bi.blood_group::TEXT AS blood_group,
            greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) AS available_units,
            bi.minimum_threshold,
            bi.updated_at
          FROM public.blood_inventory bi
          WHERE bi.blood_bank_id = b.blood_bank_id
          ORDER BY bi.blood_group,
            (greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) - bi.minimum_threshold) DESC
        ) grouped
      ) stock ON true
      WHERE b.status = 'Active'
    ), '[]'::jsonb),
    'ambulances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ambulance_id', a.ambulance_id,
        'vehicle_number', a.vehicle_number,
        'ambulance_type', a.ambulance_type,
        'status', a.status,
        'current_latitude', a.current_latitude,
        'current_longitude', a.current_longitude,
        'assigned_hospital', a.assigned_hospital,
        'updated_at', a.updated_at
      ) ORDER BY a.vehicle_number)
      FROM public.ambulances a
      JOIN public.ambulance_providers p ON p.provider_id = a.provider_id AND p.status = 'Active'
      WHERE a.status = 'Available'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinician_review_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinician_review_network() TO authenticated;
