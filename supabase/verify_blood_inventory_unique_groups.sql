-- Read-only verification for one aggregate stock row per bank and blood group.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.blood_inventory
    GROUP BY blood_bank_id, blood_group
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate blood inventory groups remain.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = idx.relnamespace
    WHERE n.nspname = 'public'
      AND idx.relname = 'blood_inventory_bank_group_unique_idx'
      AND i.indisunique
      AND i.indisvalid
  ) THEN
    RAISE EXCEPTION 'The valid unique blood bank/group index is missing.';
  END IF;
END;
$$;
