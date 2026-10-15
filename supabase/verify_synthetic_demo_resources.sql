-- Read-only checks for the synthetic public-directory seed migration.
DO $$
DECLARE
  v_hospitals INTEGER;
  v_banks INTEGER;
  v_providers INTEGER;
  v_blood_rows INTEGER;
  v_ambulances INTEGER;
BEGIN
  SELECT count(*) INTO v_hospitals FROM public.hospitals WHERE hospital_code LIKE 'LL-DEMO-HOSP-%';
  SELECT count(*) INTO v_banks FROM public.blood_banks WHERE blood_bank_code LIKE 'LL-DEMO-BANK-%';
  SELECT count(*) INTO v_providers FROM public.ambulance_providers WHERE provider_code LIKE 'LL-DEMO-EMS-%';
  SELECT count(*) INTO v_blood_rows
    FROM public.blood_inventory i JOIN public.blood_banks b ON b.blood_bank_id=i.blood_bank_id
    WHERE b.blood_bank_code LIKE 'LL-DEMO-BANK-%';
  SELECT count(*) INTO v_ambulances FROM public.ambulances WHERE vehicle_number LIKE 'LL-DEMO-UNIT-%';

  IF v_hospitals <> 8 THEN RAISE EXCEPTION 'Expected 8 synthetic hospitals; found %',v_hospitals; END IF;
  IF v_banks <> 3 THEN RAISE EXCEPTION 'Expected 3 synthetic blood banks; found %',v_banks; END IF;
  IF v_providers <> 2 THEN RAISE EXCEPTION 'Expected 2 synthetic EMS providers; found %',v_providers; END IF;
  IF v_blood_rows <> 24 THEN RAISE EXCEPTION 'Expected all 8 blood groups across 3 banks; found % rows',v_blood_rows; END IF;
  IF v_ambulances <> 4 THEN RAISE EXCEPTION 'Expected 4 synthetic fleet units; found %',v_ambulances; END IF;

  IF EXISTS (
    SELECT 1 FROM public.hospitals h
    WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%'
      AND (NOT EXISTS (SELECT 1 FROM public.icu_inventory i WHERE i.hospital_id=h.hospital_id)
        OR NOT EXISTS (SELECT 1 FROM public.general_bed_inventory i WHERE i.hospital_id=h.hospital_id)
        OR NOT EXISTS (SELECT 1 FROM public.oxygen_inventory i WHERE i.hospital_id=h.hospital_id)
        OR NOT EXISTS (SELECT 1 FROM public.medicine_inventory i WHERE i.hospital_id=h.hospital_id
          AND i.medicine_name='Synthetic demo supply pack'))
  ) THEN RAISE EXCEPTION 'At least one synthetic hospital is missing an inventory category'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.hospitals h WHERE h.hospital_code LIKE 'LL-DEMO-HOSP-%'
      AND (h.status <> 'Active' OR h.verification_status <> 'active' OR h.phone IS NOT NULL OR h.email IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Synthetic hospitals must be active demo records without contact details'; END IF;

  RAISE NOTICE 'Synthetic resource directory seed verified: 8 hospitals, 3 blood banks, 2 EMS providers, 24 blood-group rows, 4 vehicles.';
END $$;
