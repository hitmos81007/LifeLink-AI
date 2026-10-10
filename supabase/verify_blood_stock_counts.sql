-- Run after the blood inventory migrations. No historical row may violate the
-- usable stock equation or the non-negative unit/threshold requirements.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.blood_inventory
    WHERE available_units IS NULL OR available_units < 0
       OR reserved_units IS NULL OR reserved_units < 0
       OR expired_units IS NULL OR expired_units < 0
       OR minimum_threshold IS NULL OR minimum_threshold < 0
       OR reserved_units + expired_units > available_units
  ) THEN
    RAISE EXCEPTION 'Existing blood inventory rows require review before constraints can be validated';
  END IF;

END;
$$;

ALTER TABLE public.blood_inventory VALIDATE CONSTRAINT blood_inventory_counts_nonnegative;
ALTER TABLE public.blood_inventory VALIDATE CONSTRAINT blood_inventory_allocations_within_on_hand;

SELECT inventory_id, blood_bank_id, blood_group, available_units AS on_hand_units,
       reserved_units, expired_units,
       GREATEST(available_units - reserved_units - expired_units, 0) AS usable_units,
       minimum_threshold
FROM public.blood_inventory
ORDER BY blood_bank_id, blood_group;
