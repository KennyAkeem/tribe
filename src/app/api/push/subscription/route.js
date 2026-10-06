import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function POST(request) {
  const { user, error: authError } = await getAuthenticatedUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to enable notifications." }, { status: 401 });

  let subscription;
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const endpoint = subscription?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 4096 || !endpoint.startsWith("https://")
    || typeof subscription?.keys?.p256dh !== "string" || typeof subscription?.keys?.auth !== "string") {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { error } = await service.from("push_subscriptions").upsert({
      user_id: user.id,
      endpoint,
      subscription,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save this device. Check server configuration and apply the push migration." }, { status: 503 });
  }
}

export async function DELETE(request) {
  const { user, error: authError } = await getAuthenticatedUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });

  let endpoint;
  try {
    endpoint = (await request.json())?.endpoint;
  } catch {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { error } = await service.from("push_subscriptions").delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not disable notifications on this device." }, { status: 503 });
  }
}
