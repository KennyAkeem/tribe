"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, UserCheck, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeModerationRestriction } from "@/lib/moderation";

export default function ProfileFriendAction({ viewerId, targetId, username }) {
  const [relationship, setRelationship] = useState({ status: "loading", requestId: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!viewerId) return undefined;
    let active = true;
    const supabase = createClient();
    const loadRelationship = async () => {
      const [userOne, userTwo] = [viewerId, targetId].sort();
      const [friendResult, outgoingResult, incomingResult] = await Promise.all([
        supabase.from("friends").select("user_one").eq("user_one", userOne).eq("user_two", userTwo).maybeSingle(),
        supabase.from("friend_requests").select("id").eq("sender_id", viewerId).eq("receiver_id", targetId).eq("status", "pending").maybeSingle(),
        supabase.from("friend_requests").select("id").eq("sender_id", targetId).eq("receiver_id", viewerId).eq("status", "pending").maybeSingle(),
      ]);
      if (!active) return;
      const error = friendResult.error || outgoingResult.error || incomingResult.error;
      if (error) {
        setRelationship({ status: "error", requestId: "" });
        setFeedback(error.message);
      } else if (friendResult.data) {
        setRelationship({ status: "friends", requestId: "" });
      } else if (incomingResult.data) {
        setRelationship({ status: "incoming", requestId: incomingResult.data.id });
      } else if (outgoingResult.data) {
        setRelationship({ status: "outgoing", requestId: outgoingResult.data.id });
      } else {
        setRelationship({ status: "none", requestId: "" });
      }
    };
    void loadRelationship();
    return () => { active = false; };
  }, [viewerId, targetId, reload]);

  async function runAction(action) {
    setBusy(true);
    setFeedback("");
    try {
      const supabase = createClient();
      let result;
      if (action === "send") {
        result = await supabase.rpc("send_friend_request", { p_receiver_id: targetId });
      } else if (action === "accept" || action === "reject") {
        result = await supabase.rpc("respond_to_friend_request", {
          p_request_id: relationship.requestId,
          p_accept: action === "accept",
        });
      } else {
        result = await supabase.rpc("cancel_friend_request", { p_request_id: relationship.requestId });
      }

      if (result.error) {
        setFeedback(describeModerationRestriction("friend_requests", result.error));
      } else if (action === "send") {
        setRelationship({ status: "outgoing", requestId: result.data || "" });
        if (result.data) {
          void fetch("/api/push/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "friend_request", id: result.data }),
          }).catch(() => {});
        }
      } else if (action === "accept") {
        setRelationship({ status: "friends", requestId: "" });
      } else {
        setRelationship({ status: "none", requestId: "" });
      }
    } catch {
      setFeedback("Could not reach Tribe. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!viewerId) {
    const profilePath = `/profile/${encodeURIComponent(username || targetId)}`;
    return <Link className="friends-action primary" href={`/login?next=${encodeURIComponent(profilePath)}`}><UserPlus size={15} />Sign in to connect</Link>;
  }

  let actionControl;
  if (relationship.status === "loading") {
    actionControl = <button className="friends-action" type="button" disabled><LoaderCircle size={15} className="spin" />Checking</button>;
  } else if (relationship.status === "error") {
    actionControl = <button className="friends-action" type="button" onClick={() => { setFeedback(""); setRelationship({ status: "loading", requestId: "" }); setReload((value) => value + 1); }}>Try again</button>;
  } else if (relationship.status === "friends") {
    actionControl = <span className="friends-action"><UserCheck size={15} />Friends</span>;
  } else if (relationship.status === "outgoing") {
    actionControl = <button className="friends-action" type="button" disabled={busy} onClick={() => void runAction("cancel")}><X size={15} />{busy ? "Cancelling..." : "Requested"}</button>;
  } else if (relationship.status === "incoming") {
    actionControl = <div className="profile-friend-actions">
      <button className="friends-action primary" type="button" disabled={busy} onClick={() => void runAction("accept")}><Check size={15} />{busy ? "Responding..." : "Accept request"}</button>
      <button className="friends-icon-action" type="button" aria-label="Decline friend request" disabled={busy} onClick={() => void runAction("reject")}><X size={16} /></button>
    </div>;
  } else {
    actionControl = <button className="friends-action primary" type="button" disabled={busy} onClick={() => void runAction("send")}><UserPlus size={15} />{busy ? "Sending..." : "Add friend"}</button>;
  }
  return <div className="profile-friend-control">
    {actionControl}
    {feedback && <span className="profile-friend-feedback" role="status">{feedback}</span>}
  </div>;
}
