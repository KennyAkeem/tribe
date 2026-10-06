import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const stunServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const turnUrls = (process.env.TURN_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => /^(turn|turns):/i.test(url));
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  const iceServers = [...stunServers];

  if (turnUrls.length && sharedSecret) {
    const ttl = Math.min(86400, Math.max(60, Number(process.env.TURN_CREDENTIAL_TTL_SECONDS) || 3600));
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${user.id}`;
    const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
    iceServers.push({ urls: turnUrls, username, credential });
  }

  return NextResponse.json({ iceServers }, { headers: { "Cache-Control": "private, no-store" } });
}