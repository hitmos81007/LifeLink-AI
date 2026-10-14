-- Read-only verification that medicine expiry is enforced at insert and status transitions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.resource_transfers'::regclass
      AND tgname = 'resource_transfer_medicine_expiry_insert_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Medicine expiry insert guard is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.resource_transfers'::regclass
      AND tgname = 'resource_transfer_medicine_expiry_status_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Medicine expiry status-transition guard is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'guard_resource_transfer_medicine_expiry'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) ILIKE '%expiry_date%CURRENT_DATE%'
  ) THEN
    RAISE EXCEPTION 'Security-definer medicine expiry validation is missing.';
  END IF;
END;
$$;
