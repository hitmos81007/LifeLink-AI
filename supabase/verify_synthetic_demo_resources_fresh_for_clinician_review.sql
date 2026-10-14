-- Read-only verifier for 20261017200000_refresh_synthetic_demo_resources_for_clinician_review.sql.
-- Freshness expires under the normal clinician review policy (15 minutes for
-- beds/ambulances, 1 hour for oxygen/blood); rerun the demo refresh migration
-- before a later walkthrough.
DO $$
DECLARE
  v_icu INTEGER;
  v_beds INTEGER;
  v_oxygen INTEGER;
  v_blood INTEGER;
  v_ambulances INTEGER;
  v_compatible_hospitals INTEGER;
BEGIN
  SELECT count(*) INTO v_icu FROM public.icu_inventory i
  JOIN public.hospitals h USING (hospital_id)
  WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'seeded'
    AND i.updated_at >= now() - interval '15 minutes' AND i.updated_at <= now();

  SELECT count(*) INTO v_beds FROM public.general_bed_inventory i
  JOIN public.hospitals h USING (hospital_id)
  WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'seeded'
    AND i.updated_at >= now() - interval '15 minutes' AND i.updated_at <= now();

  SELECT count(*) INTO v_oxygen FROM public.oxygen_inventory i
  JOIN public.hospitals h USING (hospital_id)
  WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND i.source_type = 'seeded'
    AND i.available_capacity > i.minimum_threshold
    AND i.updated_at >= now() - interval '1 hour' AND i.updated_at <= now();

  SELECT count(*) INTO v_blood FROM public.blood_inventory i
  JOIN public.blood_banks b USING (blood_bank_id)
  WHERE b.blood_bank_code LIKE 'LL-DEMO-BANK-%' AND i.source_type = 'seeded'
    AND i.blood_group::text = 'O-'
    AND greatest(i.available_units - i.reserved_units - i.expired_units, 0) > i.minimum_threshold
    AND i.updated_at >= now() - interval '1 hour' AND i.updated_at <= now();

  SELECT count(*) INTO v_ambulances FROM public.ambulances a
  JOIN public.ambulance_providers p USING (provider_id)
  WHERE a.vehicle_number LIKE 'LL-DEMO-UNIT-%' AND a.source_type = 'seeded'
    AND p.status = 'Active' AND a.status = 'Available'
    AND a.current_latitude BETWEEN -90 AND 90 AND a.current_longitude BETWEEN -180 AND 180
    AND a.updated_at >= now() - interval '15 minutes' AND a.updated_at <= now();

  SELECT count(*) INTO v_compatible_hospitals
  FROM public.hospitals h
  JOIN public.icu_inventory i USING (hospital_id)
  WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%' AND h.status = 'Active'
    AND i.source_type = 'seeded'
    AND i.available_icu_beds - coalesce(i.minimum_icu_beds, 0) >= 1
    AND i.updated_at >= now() - interval '15 minutes' AND i.updated_at <= now()
    AND EXISTS (
      SELECT 1 FROM public.oxygen_inventory o
      WHERE o.hospital_id = h.hospital_id AND o.source_type = 'seeded'
        AND o.available_capacity > o.minimum_threshold
        AND o.updated_at >= now() - interval '1 hour' AND o.updated_at <= now()
    );

  IF v_icu = 0 OR v_beds = 0 OR v_oxygen = 0 OR v_blood = 0 OR v_ambulances = 0
     OR v_compatible_hospitals = 0 THEN
    RAISE EXCEPTION 'Synthetic clinician review fixtures are not fresh/compatible: ICU %, beds %, oxygen %, O- banks %, ambulances %, compatible hospitals %',
      v_icu, v_beds, v_oxygen, v_blood, v_ambulances, v_compatible_hospitals;
  END IF;

  RAISE NOTICE 'Synthetic review fixture verified: % ICU rows, % general-bed rows, % oxygen rows above threshold, % compatible O- banks, % available ambulances, % compatible hospitals.',
    v_icu, v_beds, v_oxygen, v_blood, v_ambulances, v_compatible_hospitals;
END $$;
