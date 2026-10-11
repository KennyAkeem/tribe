import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push event." }, { status: 400 });
  }
  if (!body?.id || !["message", "friend_request"].includes(body.type)) {
    return NextResponse.json({ error: "Invalid push event." }, { status: 400 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !vapidSubject) {
    return NextResponse.json({ error: "Web Push is not configured on the server." }, { status: 503 });
  }

  try {
    const service = createServiceClient();
    let recipientIds = [];
    let notification;
    let actorId = user.id;

    if (body.type === "message") {
      const { data: message, error } = await service.from("messages")
        .select("id, conversation_id, sender_id")
        .eq("id", body.id)
        .maybeSingle();
      if (error || !message || message.sender_id !== user.id) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }
      const { data: members, error: membersError } = await service.from("conversation_members")
        .select("user_id")
        .eq("conversation_id", message.conversation_id)
        .neq("user_id", user.id);
      if (membersError) throw membersError;
      recipientIds = (members || []).map((member) => member.user_id);
      notification = {
        title: "New message",
        body: "You have a new message on Tribe.",
        url: `/messages?conversation=${encodeURIComponent(message.conversation_id)}`,
        tag: `tribe-message-${message.id}`,
      };
    } else {
      const { data: friendRequest, error } = await service.from("friend_requests")
        .select("id, sender_id, receiver_id, status")
        .eq("id", body.id)
        .maybeSingle();
      if (error || !friendRequest || friendRequest.sender_id !== user.id || friendRequest.status !== "pending") {
        return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
      }
      actorId = friendRequest.sender_id;
      recipientIds = [friendRequest.receiver_id];
      notification = {
        title: "New friend request",
        body: "Someone wants to connect with you on Tribe.",
        url: "/friends?tab=requests",
        tag: `tribe-friend-request-${friendRequest.id}`,
      };
    }

    if (!recipientIds.length) return NextResponse.json({ ok: true, sent: 0 });

    const [{ data: subscriptions, error: subscriptionError }, { data: profile }] = await Promise.all([
      service.from("push_subscriptions").select("id, endpoint, subscription").in("user_id", recipientIds),
      service.from("profiles").select("full_name, username").eq("id", actorId).maybeSingle(),
    ]);
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) return NextResponse.json({ ok: true, sent: 0 });

    const { error: dispatchError } = await service.from("push_dispatches").insert({
      notification_type: body.type,
      entity_id: body.id,
    });
    if (dispatchError?.code === "23505") return NextResponse.json({ ok: true, sent: 0, duplicate: true });
    if (dispatchError) throw dispatchError;

    const actorName = profile?.full_name || profile?.username || "A Tribe member";
    const payload = JSON.stringify({
      ...notification,
      title: body.type === "message" ? `Message from ${actorName}` : notification.title,
    });
    webpush.setVapidDetails(
      vapidSubject,
      publicKey,
      privateKey,
    );

    const results = await Promise.allSettled((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription.subscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        return true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("id", subscription.id);
        }
        throw error;
      }
    }));

    const sent = results.filter((result) => result.status === "fulfilled").length;
    if (!sent) {
      const { error: cleanupError } = await service.from("push_dispatches")
        .delete()
        .eq("notification_type", body.type)
        .eq("entity_id", body.id);
      if (cleanupError) throw cleanupError;
    }

    return NextResponse.json({
      ok: true,
      sent,
      failed: results.length - sent,
    });
  } catch {
    return NextResponse.json({ error: "Could not deliver push notifications." }, { status: 503 });
  }
}
