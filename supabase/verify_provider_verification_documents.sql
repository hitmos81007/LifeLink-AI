-- Run after 20261014100000_provider_verification_documents.sql in Supabase SQL Editor.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'provider-verification-documents' AND public IS FALSE) THEN
    RAISE EXCEPTION 'Provider proof bucket is missing or public';
  END IF;
  IF to_regclass('public.provider_verification_documents') IS NULL THEN
    RAISE EXCEPTION 'Provider verification document table is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'provider_requires_verified_document' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Provider activation guard is missing';
  END IF;
  IF to_regprocedure('public.review_provider_verification_document(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Document review RPC is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.provider_verification_documents'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Document row-level security is not enabled';
  END IF;
END;
$$;

SELECT bucket_id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'provider-verification-documents';
SELECT policyname, tablename, cmd FROM pg_policies
WHERE (schemaname = 'public' AND tablename = 'provider_verification_documents')
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'provider_verification_objects_%')
ORDER BY schemaname, tablename, policyname;
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.users'::regclass AND tgname = 'provider_requires_verified_document';
