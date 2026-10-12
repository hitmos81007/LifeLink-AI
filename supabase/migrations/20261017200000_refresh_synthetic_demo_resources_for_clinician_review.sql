-- Re-baseline the reserved fictional demo snapshots before a prototype review.
-- This touches timestamps only: quantities, holds, thresholds and statuses are
-- unchanged. A recent timestamp means this synthetic fixture was refreshed for
-- the demo, not that any real facility reported current availability.
BEGIN;

UPDATE public.icu_inventory i
SET updated_at = now()
FROM public.hospitals h
WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%'
  AND i.source_type = 'seeded';

UPDATE public.general_bed_inventory i
SET updated_at = now()
FROM public.hospitals h
WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%'
  AND i.source_type = 'seeded';

UPDATE public.oxygen_inventory i
SET updated_at = now()
FROM public.hospitals h
WHERE h.hospital_id = i.hospital_id
  AND h.hospital_code LIKE 'LL-DEMO-HOSP-%'
  AND i.source_type = 'seeded';

UPDATE public.blood_inventory i
SET updated_at = now()
FROM public.blood_banks b
WHERE b.blood_bank_id = i.blood_bank_id
  AND b.blood_bank_code LIKE 'LL-DEMO-BANK-%'
  AND i.source_type = 'seeded';

UPDATE public.ambulances a
SET updated_at = now()
WHERE a.vehicle_number LIKE 'LL-DEMO-UNIT-%'
  AND a.source_type = 'seeded';

COMMIT;
