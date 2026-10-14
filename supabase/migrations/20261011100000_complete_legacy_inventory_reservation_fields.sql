-- Bring legacy production inventory tables up to the reservation model used by
-- current workflows. Existing counts are preserved; new reservation counters
-- start at zero and bed safety thresholds default to zero until configured.
BEGIN;

ALTER TABLE public.general_bed_inventory
  ADD COLUMN IF NOT EXISTS reserved_beds INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_beds >= 0),
  ADD COLUMN IF NOT EXISTS minimum_beds INTEGER NOT NULL DEFAULT 0
    CHECK (minimum_beds >= 0);

ALTER TABLE public.icu_inventory
  ADD COLUMN IF NOT EXISTS minimum_icu_beds INTEGER NOT NULL DEFAULT 0
    CHECK (minimum_icu_beds >= 0);

ALTER TABLE public.oxygen_inventory
  ADD COLUMN IF NOT EXISTS reserved_capacity NUMERIC NOT NULL DEFAULT 0
    CHECK (reserved_capacity >= 0);

ALTER TABLE public.medicine_inventory
  ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0
    CHECK (reserved_stock >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.general_bed_inventory'::regclass
      AND conname='general_minimum_beds_within_capacity_check'
  ) THEN
    ALTER TABLE public.general_bed_inventory
      ADD CONSTRAINT general_minimum_beds_within_capacity_check
      CHECK (minimum_beds <= total_beds);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.icu_inventory'::regclass
      AND conname='icu_minimum_beds_within_capacity_check'
  ) THEN
    ALTER TABLE public.icu_inventory
      ADD CONSTRAINT icu_minimum_beds_within_capacity_check
      CHECK (minimum_icu_beds <= total_icu_beds);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.general_bed_inventory'::regclass
      AND conname='general_reserved_beds_within_capacity_check'
  ) THEN
    ALTER TABLE public.general_bed_inventory
      ADD CONSTRAINT general_reserved_beds_within_capacity_check
      CHECK (occupied_beds + reserved_beds <= total_beds);
  END IF;
END;
$$;

COMMIT;
