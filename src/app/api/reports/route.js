import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const categories = new Set(["harassment", "spam", "impersonation", "unsafe_content", "other"]);

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to submit a report." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
  const category = String(body.category || "");
  const details = String(body.details || "").trim();
  const targetUserId = body.targetUserId ? String(body.targetUserId) : null;
  if (!categories.has(category) || details.length > 2000 || !targetUserId || targetUserId === user.id) {
    return NextResponse.json({ error: "Check the report details and try again." }, { status: 400 });
  }
  const { error } = await supabase.from("user_reports").insert({
    reporter_id: user.id,
    target_user_id: targetUserId,
    category,
    details,
  });
  if (error) return NextResponse.json({ error: "Could not submit the report. Confirm the admin migrations are applied." }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}