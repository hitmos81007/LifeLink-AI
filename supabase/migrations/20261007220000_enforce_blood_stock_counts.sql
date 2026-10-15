-- Blood available_units is the on-hand count. Usable units are derived as
-- on-hand minus reserved and expired; counts must remain internally consistent.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blood_inventory_counts_nonnegative'
      AND conrelid = 'public.blood_inventory'::regclass
  ) THEN
    ALTER TABLE public.blood_inventory
      ADD CONSTRAINT blood_inventory_counts_nonnegative
      CHECK (
        available_units IS NOT NULL AND available_units >= 0
        AND reserved_units IS NOT NULL AND reserved_units >= 0
        AND expired_units IS NOT NULL AND expired_units >= 0
        AND minimum_threshold IS NOT NULL AND minimum_threshold >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blood_inventory_allocations_within_on_hand'
      AND conrelid = 'public.blood_inventory'::regclass
  ) THEN
    ALTER TABLE public.blood_inventory
      ADD CONSTRAINT blood_inventory_allocations_within_on_hand
      CHECK (reserved_units + expired_units <= available_units) NOT VALID;
  END IF;
END;
$$;

COMMIT;
