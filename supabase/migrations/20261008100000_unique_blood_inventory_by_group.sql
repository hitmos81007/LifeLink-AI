-- The prototype stores aggregate stock per blood group at each bank. Keep one
-- row per bank/group so updates are atomic and public availability is unambiguous.
-- Existing duplicates are preserved for manual review; the migration fails with
-- a diagnostic instead of deleting or merging inventory records.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.blood_inventory
    GROUP BY blood_bank_id, blood_group
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate blood_inventory rows exist for a blood bank and blood group. Review and reconcile those records before applying the unique inventory index.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS blood_inventory_bank_group_unique_idx
  ON public.blood_inventory (blood_bank_id, blood_group);

COMMIT;
