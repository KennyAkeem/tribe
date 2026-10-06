import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { countryNameForCode } from "@/lib/countries";
import { encryptVerificationId } from "@/lib/verification-crypto";

const idTypes = new Set(["passport", "national_id", "drivers_license", "residence_permit", "other"]);
const documentBucket = "verification-documents";
const documentTypes = new Map([
  ["image/jpeg", { extension: "jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/png", { extension: "png", signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
  ["image/webp", { extension: "webp", signature: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }],
]);
const maxDocumentSize = 8 * 1024 * 1024;

function isValidDocument(file) {
  return file instanceof File && file.size > 0 && file.size <= maxDocumentSize && documentTypes.has(file.type);
}

export async function POST(request) {
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(requestUrl.hostname);
  if (forwardedProtocol !== "https" && requestUrl.protocol !== "https:" && !isLocalhost) {
    return NextResponse.json({ error: "Submit verification details over HTTPS." }, { status: 426 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to apply for verification." }, { status: 401 });
  if (!user.email_confirmed_at) return NextResponse.json({ error: "Confirm your email before applying." }, { status: 403 });
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("is_verified")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Could not check your verification status." }, { status: 503 });
  if (profile?.is_verified) return NextResponse.json({ error: "Your profile is already verified." }, { status: 409 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const phoneNumber = String(form.get("phoneNumber") || "").trim();
  const countryCode = String(form.get("countryCode") || "").trim().toUpperCase();
  const governmentIdType = String(form.get("governmentIdType") || "");
  const governmentId = String(form.get("governmentId") || "").trim();
  const frontFile = form.get("idFront");
  const backFile = form.get("idBack");
  const countryName = countryNameForCode(countryCode);
  if (phoneNumber.length < 5 || phoneNumber.length > 40 || !/^\+?[\d\s().-]+$/.test(phoneNumber)) {
    return NextResponse.json({ error: "Enter a valid phone number, including country code." }, { status: 400 });
  }
  if (!countryName || !idTypes.has(governmentIdType) || governmentId.length < 3 || governmentId.length > 120) {
    return NextResponse.json({ error: "Enter a valid location and government-issued ID details." }, { status: 400 });
  }
  if (![frontFile, backFile].every(isValidDocument)) {
    return NextResponse.json({ error: "Upload clear front and back ID photos in JPG, PNG, or WebP format. Each photo must be 8 MB or smaller." }, { status: 400 });
  }

  let governmentIdCiphertext;
  try {
    governmentIdCiphertext = encryptVerificationId(governmentId);
  } catch {
    return NextResponse.json({ error: "Verification ID encryption is not configured. Set VERIFICATION_ID_ENCRYPTION_KEY to a 64-character hex key on the server and restart the app." }, { status: 503 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Verification submissions are not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server and restart the app." }, { status: 503 });
  }
  const uploadedPaths = [];
  for (const [side, file] of [["front", frontFile], ["back", backFile]]) {
    const fileType = documentTypes.get(file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!fileType.signature(bytes)) {
      if (uploadedPaths.length) await service.storage.from(documentBucket).remove(uploadedPaths);
      return NextResponse.json({ error: "The selected ID photo is not a valid image. Choose a JPG, PNG, or WebP photo." }, { status: 400 });
    }
    const path = `${user.id}/${crypto.randomUUID()}-${side}.${fileType.extension}`;
    const { error: uploadError } = await service.storage.from(documentBucket).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      if (uploadedPaths.length) await service.storage.from(documentBucket).remove(uploadedPaths);
      return NextResponse.json({ error: "Private ID photo storage is not ready. Apply the verification document migration in Supabase and try again." }, { status: 503 });
    }
    uploadedPaths.push(path);
  }

  const { data, error } = await service.from("verification_requests").insert({
    user_id: user.id,
    phone_number: phoneNumber,
    country_code: countryCode,
    country_name: countryName,
    government_id_type: governmentIdType,
    government_id_ciphertext: governmentIdCiphertext,
    id_front_path: uploadedPaths[0],
    id_back_path: uploadedPaths[1],
  }).select("id, status, created_at").single();

  if (error) {
    await service.storage.from(documentBucket).remove(uploadedPaths);
    if (error.code === "23505") return NextResponse.json({ error: "You already have a pending verification request." }, { status: 409 });
    if (error.code === "42703") return NextResponse.json({ error: "Verification photo storage is not configured. Apply the verification document migration in Supabase, then try again." }, { status: 503 });
    return NextResponse.json({ error: "Could not submit your application. Confirm the admin migrations are applied." }, { status: 400 });
  }
  return NextResponse.json({ request: data }, { status: 201 });
}