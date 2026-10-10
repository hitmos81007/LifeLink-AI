-- Read-only verification for 20261009105000_remove_permissive_legacy_policies.sql.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('ai_recommendations','general_bed_inventory','oxygen_inventory','resource_transfers')
      AND 'public'=ANY(roles)
      AND (qual='true' OR with_check='true')
  ) THEN
    RAISE EXCEPTION 'An unconditional public policy still grants broad access to a protected workflow table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_recommendations'
      AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual IS NOT NULL AND qual<>'true'
  ) THEN
    RAISE EXCEPTION 'Scoped authenticated AI recommendation read policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='general_bed_inventory'
      AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual IS NOT NULL AND qual<>'true'
  ) THEN
    RAISE EXCEPTION 'Scoped authenticated general-bed read policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual IS NOT NULL AND qual<>'true'
  ) THEN
    RAISE EXCEPTION 'Scoped authenticated oxygen read policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='resource_transfers'
      AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual IS NOT NULL AND qual<>'true'
  ) THEN
    RAISE EXCEPTION 'Scoped authenticated resource-transfer read policy is missing';
  END IF;
  RAISE NOTICE 'PASS: no unconditional public policies remain on protected workflow tables';
END $$;

SELECT tablename,policyname,cmd,roles,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('ai_recommendations','general_bed_inventory','oxygen_inventory','resource_transfers')
ORDER BY tablename,policyname;
