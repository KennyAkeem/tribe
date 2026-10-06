import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptVerificationId } from "@/lib/verification-crypto";

export async function GET(_request, { params }) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError || !isAdmin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const { data, error } = await supabase.from("verification_requests")
    .select("government_id_ciphertext")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Pending request not found." }, { status: 404 });

  let governmentId;
  try {
    governmentId = decryptVerificationId(data.government_id_ciphertext);
  } catch {
    return NextResponse.json({ error: "Could not decrypt this ID. VERIFICATION_ID_ENCRYPTION_KEY must match the key used when this request was submitted." }, { status: 503 });
  }

  const { error: auditError } = await supabase.rpc("admin_record_identity_access", { p_request_id: requestId });
  if (auditError) {
    return NextResponse.json({ error: "Could not record ID access. Confirm the admin portal actions migration is applied." }, { status: 503 });
  }
  return NextResponse.json({ governmentId }, { headers: { "Cache-Control": "private, no-store" } });
}