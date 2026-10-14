-- Public discovery returns only the directory fields and shareable availability
-- needed by the resource finder. Reservation counts, safety thresholds, driver
-- details, and raw inventory rows remain private.
CREATE OR REPLACE FUNCTION public.get_public_resource_directory()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'hospitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.hospital_id,
        'name', h.hospital_name,
        'address', h.address,
        'district', h.district,
        'state', h.state,
        -- These broad state bounds suppress clearly misplaced demo coordinates;
        -- they are not a geocoder or a precise Tamil Nadu boundary check.
        'latitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(h.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                              AND (h.latitude NOT BETWEEN 7.5 AND 14.0 OR h.longitude NOT BETWEEN 75.0 AND 81.0)
                         THEN NULL ELSE h.latitude END,
        'longitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(h.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                               AND (h.latitude NOT BETWEEN 7.5 AND 14.0 OR h.longitude NOT BETWEEN 75.0 AND 81.0)
                          THEN NULL ELSE h.longitude END,
        'phone', h.phone,
        'hospital_type', h.hospital_type,
        'trauma_center', h.trauma_center,
        'profile_updated_at', h.updated_at,
        'icu_beds', icu.available_units,
        'icu_status', CASE WHEN icu.available_units IS NULL THEN 'Unknown' WHEN icu.available_units > 0 THEN 'Available' ELSE 'Critical' END,
        'icu_updated_at', icu.updated_at,
        'general_beds', beds.available_units,
        'general_beds_status', CASE WHEN beds.available_units IS NULL THEN 'Unknown' WHEN beds.available_units > 0 THEN 'Available' ELSE 'Critical' END,
        'general_beds_updated_at', beds.updated_at,
        'oxygen', COALESCE(oxygen.items, '[]'::jsonb),
        'medicines', COALESCE(medicines.items, '[]'::jsonb)
      ) ORDER BY h.hospital_name)
      FROM public.hospitals h
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(i.available_icu_beds) END AS available_units,
               CASE WHEN count(*) = 1 THEN max(i.updated_at) END AS updated_at
        FROM public.icu_inventory i WHERE i.hospital_id = h.hospital_id
      ) icu ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(b.available_beds) END AS available_units,
               CASE WHEN count(*) = 1 THEN max(b.updated_at) END AS updated_at
        FROM public.general_bed_inventory b WHERE b.hospital_id = h.hospital_id
      ) beds ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'type', stock.oxygen_type,
          'quantity', stock.quantity,
          'unit', stock.unit,
          'availability_status', stock.availability_status,
          'updated_at', stock.updated_at
        ) ORDER BY stock.oxygen_type) AS items
        FROM (
          SELECT o.oxygen_type::text AS oxygen_type,
                 sum(GREATEST(o.available_capacity - o.minimum_threshold, 0))::integer AS quantity,
                 max(o.unit) AS unit,
                 CASE WHEN bool_or(o.available_capacity > o.minimum_threshold) THEN 'Available' ELSE 'Critical' END AS availability_status,
                 min(o.updated_at) AS updated_at
          FROM public.oxygen_inventory o
          WHERE o.hospital_id = h.hospital_id
          GROUP BY o.oxygen_type
        ) stock
      ) oxygen ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'name', medicine_stock.medicine_name,
          'category', medicine_stock.category,
          'dosage', medicine_stock.dosage,
          'quantity', medicine_stock.quantity,
          'unit', medicine_stock.unit,
          'availability_status', medicine_stock.availability_status,
          'updated_at', medicine_stock.updated_at
        ) ORDER BY medicine_stock.medicine_name, medicine_stock.dosage) AS items
        FROM (
          -- Aggregate rows per medicine before building one array for the hospital.
          -- current_stock already excludes transfer-approved quantities.
          SELECT m.medicine_name,
                 m.category,
                 m.dosage,
                 m.unit,
                 sum(GREATEST(m.current_stock, 0))::integer AS quantity,
                 CASE WHEN sum(GREATEST(m.current_stock, 0)) > sum(m.minimum_stock)
                      THEN 'Available' ELSE 'Critical' END AS availability_status,
                 min(m.updated_at) AS updated_at
          FROM public.medicine_inventory m
          WHERE m.hospital_id = h.hospital_id
            AND (m.expiry_date IS NULL OR m.expiry_date >= current_date)
          GROUP BY m.medicine_name, m.category, m.dosage, m.unit
        ) medicine_stock
      ) medicines ON true
      WHERE h.status = 'Active'
    ), '[]'::jsonb),
    'blood_banks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.blood_bank_id,
        'name', b.blood_bank_name,
        'address', b.address,
        'district', b.district,
        'state', b.state,
        'latitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(b.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                              AND (b.latitude NOT BETWEEN 7.5 AND 14.0 OR b.longitude NOT BETWEEN 75.0 AND 81.0)
                         THEN NULL ELSE b.latitude END,
        'longitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(b.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                               AND (b.latitude NOT BETWEEN 7.5 AND 14.0 OR b.longitude NOT BETWEEN 75.0 AND 81.0)
                          THEN NULL ELSE b.longitude END,
        'phone', b.phone,
        'profile_updated_at', b.updated_at,
        'stock', COALESCE(stock.items, '[]'::jsonb)
      ) ORDER BY b.blood_bank_name)
      FROM public.blood_banks b
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'blood_group', stock.blood_group,
          'quantity', stock.usable_units,
          'availability_status', stock.availability_status,
          'updated_at', stock.updated_at
        ) ORDER BY stock.blood_group) AS items
        FROM (
          SELECT bi.blood_group::text AS blood_group,
                 CASE WHEN count(*) = 1 THEN max(GREATEST(bi.available_units - bi.reserved_units - bi.expired_units, 0)) END AS usable_units,
                 CASE WHEN count(*) = 1 AND max(GREATEST(bi.available_units - bi.reserved_units - bi.expired_units, 0)) > max(bi.minimum_threshold)
                      THEN 'Available' WHEN count(*) = 1 THEN 'Critical' ELSE 'Unknown' END AS availability_status,
                 CASE WHEN count(*) = 1 THEN max(bi.updated_at) END AS updated_at
          FROM public.blood_inventory bi
          WHERE bi.blood_bank_id = b.blood_bank_id
          GROUP BY bi.blood_group
        ) stock
      ) stock ON true
      WHERE b.status = 'Active'
    ), '[]'::jsonb),
    'ambulance_providers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.provider_id,
        'name', p.provider_name,
        'district', p.district,
        'state', p.state,
        'phone', p.phone,
        'available_units', fleet.available_units,
        'availability_status', CASE WHEN fleet.available_units > 0 THEN 'Available' ELSE 'Critical' END,
        'approximate_latitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(p.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                                          AND (fleet.approximate_latitude NOT BETWEEN 7.5 AND 14.0 OR fleet.approximate_longitude NOT BETWEEN 75.0 AND 81.0)
                                     THEN NULL ELSE fleet.approximate_latitude END,
        'approximate_longitude', CASE WHEN regexp_replace(lower(btrim(COALESCE(p.state, ''))), '[^a-z]', '', 'g') = 'tamilnadu'
                                           AND (fleet.approximate_latitude NOT BETWEEN 7.5 AND 14.0 OR fleet.approximate_longitude NOT BETWEEN 75.0 AND 81.0)
                                      THEN NULL ELSE fleet.approximate_longitude END,
        'updated_at', fleet.updated_at
      ) ORDER BY p.provider_name)
      FROM public.ambulance_providers p
      JOIN LATERAL (
        SELECT count(*)::integer AS available_units,
               CASE WHEN count(*) > 0 AND count(a.current_latitude) = count(*)
                    THEN round(avg(a.current_latitude)::numeric, 2) END AS approximate_latitude,
               CASE WHEN count(*) > 0 AND count(a.current_longitude) = count(*)
                    THEN round(avg(a.current_longitude)::numeric, 2) END AS approximate_longitude,
               min(a.updated_at) AS updated_at
        FROM public.ambulances a
        WHERE a.provider_id = p.provider_id AND a.status = 'Available'
      ) fleet ON true
      WHERE p.status = 'Active'
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_resource_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_resource_directory() TO anon, authenticated;
