-- Remove unconditional legacy policies left by early prototype repair scripts.
-- PostgreSQL OR-combines permissive policies; a scoped replacement is ineffective
-- while an older TO public USING (true) / WITH CHECK (true) policy remains.
DO $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('ai_recommendations','general_bed_inventory','oxygen_inventory','resource_transfers')
      AND 'public'=ANY(roles)
      AND (qual='true' OR with_check='true')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',v_policy.policyname,v_policy.schemaname,v_policy.tablename);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
