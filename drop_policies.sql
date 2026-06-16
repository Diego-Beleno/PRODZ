DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT policyname, schemaname, tablename FROM pg_policies 
    WHERE policyname LIKE 'Permitir%' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;
