-- Do not advertise a donor that cannot complete the human-reviewed transfer
-- lifecycle. Approval requires an active source hospital_approver, and the
-- handoff requires an active source hospital_admin.
BEGIN;

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
DECLARE
  v_user public.users;
  v_receiver public.hospitals;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::TEXT<>'hospital_admin'
     OR v_user.status IS DISTINCT FROM TRUE OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active receiving-hospital administrator account is required';
  END IF;
  IF p_resource_type NOT IN ('ICU Beds','General Beds','Oxygen','Medicine') THEN
    RAISE EXCEPTION 'Unsupported transferable resource';
  END IF;

  SELECT * INTO v_receiver
  FROM public.hospitals
  WHERE hospital_id=v_user.hospital_id AND status='Active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Your assigned hospital must be active'; END IF;

  RETURN QUERY
  WITH donors AS (
    SELECT i.hospital_id, 'ICU Beds'::TEXT AS resource_type, 'ICU Beds'::TEXT AS resource_name,
      jsonb_build_object('resource_type','ICU Beds') AS identity,
      (i.available_icu_beds-i.minimum_icu_beds)::NUMERIC AS quantity, 'beds'::TEXT AS unit
    FROM public.icu_inventory i
    WHERE p_resource_type='ICU Beds' AND i.available_icu_beds>i.minimum_icu_beds
      AND (SELECT count(*) FROM public.icu_inventory x WHERE x.hospital_id=i.hospital_id)=1
    UNION ALL
    SELECT i.hospital_id, 'General Beds', 'General Beds', jsonb_build_object('resource_type','General Beds'),
      (i.available_beds-i.minimum_beds)::NUMERIC, 'beds'
    FROM public.general_bed_inventory i
    WHERE p_resource_type='General Beds' AND i.available_beds>i.minimum_beds
      AND (SELECT count(*) FROM public.general_bed_inventory x WHERE x.hospital_id=i.hospital_id)=1
    UNION ALL
    SELECT i.hospital_id, 'Oxygen', i.oxygen_type::TEXT,
      jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit),
      floor(i.available_capacity-i.minimum_threshold), i.unit
    FROM public.oxygen_inventory i
    WHERE p_resource_type='Oxygen' AND i.available_capacity>i.minimum_threshold
      AND (SELECT count(*) FROM public.oxygen_inventory x WHERE x.hospital_id=i.hospital_id
        AND x.oxygen_type=i.oxygen_type AND x.unit=i.unit)=1
    UNION ALL
    SELECT i.hospital_id, 'Medicine', i.medicine_name,
      jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,
        'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date),
      (i.current_stock-i.minimum_stock)::NUMERIC, i.unit
    FROM public.medicine_inventory i
    WHERE p_resource_type='Medicine' AND i.current_stock>i.minimum_stock
      AND (i.expiry_date IS NULL OR i.expiry_date>=CURRENT_DATE)
      AND (SELECT count(*) FROM public.medicine_inventory x WHERE x.hospital_id=i.hospital_id
        AND x.medicine_name=i.medicine_name AND x.category=i.category AND x.dosage=i.dosage
        AND x.manufacturer IS NOT DISTINCT FROM i.manufacturer AND x.unit=i.unit
        AND x.expiry_date IS NOT DISTINCT FROM i.expiry_date)=1
  ), located AS (
    SELECT h.hospital_id, h.hospital_name, h.hospital_code, h.district, h.state, h.latitude, h.longitude,
      d.resource_type, d.resource_name, d.identity, d.quantity, d.unit,
      CASE WHEN h.latitude IS NOT NULL AND h.longitude IS NOT NULL
             AND v_receiver.latitude IS NOT NULL AND v_receiver.longitude IS NOT NULL THEN
        round(
          (6371.0 * 2 * asin(sqrt(LEAST(1.0,GREATEST(0.0,
            power(sin(radians((h.latitude-v_receiver.latitude)::DOUBLE PRECISION/2)),2) +
            cos(radians(v_receiver.latitude::DOUBLE PRECISION)) * cos(radians(h.latitude::DOUBLE PRECISION)) *
            power(sin(radians((h.longitude-v_receiver.longitude)::DOUBLE PRECISION/2)),2)
          )))))::NUMERIC,
          1
        )
      ELSE NULL END AS distance
    FROM donors d JOIN public.hospitals h ON h.hospital_id=d.hospital_id
    WHERE h.status='Active' AND h.hospital_id<>v_user.hospital_id AND d.quantity>0
      AND EXISTS (
        SELECT 1 FROM public.users approver
        WHERE approver.hospital_id=h.hospital_id
          AND approver.role::TEXT='hospital_approver'
          AND approver.status IS TRUE
      )
      AND EXISTS (
        SELECT 1 FROM public.users source_admin
        WHERE source_admin.hospital_id=h.hospital_id
          AND source_admin.role::TEXT='hospital_admin'
          AND source_admin.status IS TRUE
      )
  )
  SELECT l.hospital_id,l.hospital_name,l.hospital_code,l.district,l.state,l.distance,
    l.resource_type,l.resource_name,l.identity,l.quantity,l.unit
  FROM located l
  ORDER BY l.distance NULLS LAST,l.state,l.district,l.hospital_name
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_transfer_sources(TEXT) TO authenticated;
COMMIT;
