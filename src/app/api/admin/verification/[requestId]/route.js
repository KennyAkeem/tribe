import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const documentBucket = "verification-documents";

async function getAdminClient() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError || !isAdmin) return { response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { supabase };
}

export async function GET(_request, { params }) {
  const { requestId } = await params;
  const { supabase, response } = await getAdminClient();
  if (response) return response;

  const { data, error } = await supabase.from("verification_requests")
    .select("id_front_path, id_back_path")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read the ID photo paths. Confirm the verification document migration is applied." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Pending request not found." }, { status: 404 });
  if (!data.id_front_path || !data.id_back_path) {
    return NextResponse.json({ error: "This request has no uploaded ID photos." }, { status: 404 });
  }

  const { error: auditError } = await supabase.rpc("admin_record_identity_access", { p_request_id: requestId });
  if (auditError) return NextResponse.json({ error: "Could not record document access. Confirm the admin portal actions migration is applied." }, { status: 503 });

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Private document access is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }
  const storage = service.storage.from(documentBucket);
  const [front, back] = await Promise.all([
    storage.createSignedUrl(data.id_front_path, 300),
    storage.createSignedUrl(data.id_back_path, 300),
  ]);
  if (front.error || back.error) {
    return NextResponse.json({ error: "Could not create private photo links. Confirm both uploaded files exist in the verification-documents bucket." }, { status: 503 });
  }
  return NextResponse.json({ frontUrl: front.data.signedUrl, backUrl: back.data.signedUrl }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request, { params }) {
  const { requestId } = await params;
  const { supabase, response } = await getAdminClient();
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid review submission." }, { status: 400 });
  }
  if (typeof body.approve !== "boolean" || typeof body.note !== "string" || body.note.length > 1000) {
    return NextResponse.json({ error: "Enter a valid review decision and note." }, { status: 400 });
  }

  const { data: verification, error: lookupError } = await supabase.from("verification_requests")
    .select("id_front_path, id_back_path")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (lookupError || !verification) return NextResponse.json({ error: "Pending request not found." }, { status: 404 });

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Private document cleanup is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  }
  const { error: reviewError } = await supabase.rpc("admin_review_verification", {
    p_request_id: requestId,
    p_approve: body.approve,
    p_note: body.note,
  });
  if (reviewError) return NextResponse.json({ error: reviewError.message || "Could not update this verification request." }, { status: 400 });

  const paths = [verification.id_front_path, verification.id_back_path].filter(Boolean);
  if (paths.length) await service.storage.from(documentBucket).remove(paths);
  return NextResponse.json({ success: true });
}