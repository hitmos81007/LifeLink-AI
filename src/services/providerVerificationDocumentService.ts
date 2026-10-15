import { supabase } from '../lib/supabase/client';

export type ProviderProofStatus = 'pending' | 'verified' | 'rejected';
export type ProviderProofKind = 'hospital' | 'blood_bank' | 'ambulance';

export interface ProviderVerificationDocument {
  document_id: string;
  user_id: string;
  provider_kind: ProviderProofKind;
  document_type: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  status: ProviderProofStatus;
  review_reason: string | null;
  created_at: string;
}

const BUCKET = 'provider-verification-documents';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function validateProviderProof(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Choose a PDF, JPG, or PNG document.');
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('The document must be smaller than 10 MB.');
}

export async function uploadProviderVerificationDocument(file: File, documentType: string): Promise<void> {
  validateProviderProof(file);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Sign in before uploading provider verification documents.');
  const { data: profile, error: profileError } = await supabase.from('users').select('role,account_status').eq('user_id', user.id).maybeSingle();
  if (profileError) throw new Error(`Could not confirm provider account: ${profileError.message}`);
  const kindByRole: Record<string, ProviderProofKind> = { hospital_admin: 'hospital', blood_bank_admin: 'blood_bank', ambulance_admin: 'ambulance' };
  const kind = kindByRole[profile?.role || ''];
  if (!kind || profile?.account_status !== 'pending') throw new Error('Only pending provider accounts can submit verification documents.');
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`Private document upload failed: ${uploadError.message}`);
  const { error: insertError } = await supabase.from('provider_verification_documents').insert({
    user_id: user.id,
    provider_kind: kind,
    document_type: documentType.trim().slice(0, 120),
    object_path: path,
    original_filename: file.name.slice(0, 255),
    mime_type: file.type,
    byte_size: file.size,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Document metadata could not be saved: ${insertError.message}`);
  }
}

export async function listProviderVerificationDocuments(): Promise<ProviderVerificationDocument[]> {
  const { data, error } = await supabase.from('provider_verification_documents')
    .select('document_id,user_id,provider_kind,document_type,original_filename,mime_type,byte_size,status,review_reason,created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load verification documents: ${error.message}`);
  return (data || []) as ProviderVerificationDocument[];
}

export async function openProviderVerificationDocument(documentId: string): Promise<void> {
  const documentTab = window.open('about:blank', '_blank');
  if (documentTab) documentTab.opener = null;
  const { data: row, error: rowError } = await supabase.from('provider_verification_documents').select('object_path').eq('document_id', documentId).single();
  if (rowError || !row) { documentTab?.close(); throw new Error(`Could not access verification document: ${rowError?.message || 'not found'}`); }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.object_path, 60);
  if (error || !data?.signedUrl) { documentTab?.close(); throw new Error(`Could not create secure document link: ${error?.message || 'no link returned'}`); }
  if (documentTab) documentTab.location.href = data.signedUrl;
  else throw new Error('The browser blocked the secure document tab. Allow pop-ups for this site and retry.');
}

export async function reviewProviderVerificationDocument(documentId: string, decision: 'verified' | 'rejected', reason: string): Promise<void> {
  const { error } = await supabase.rpc('review_provider_verification_document', {
    p_document_id: documentId,
    p_decision: decision,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(`Document review was not saved: ${error.message}`);
}
