"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, LoaderCircle, Search, UserCheck, UserPlus, UserRoundX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeModerationRestriction } from "@/lib/moderation";

function initials(name = "Member") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
}

function MemberAvatar({ person }) {
  return (
    <span className="friends-avatar">
      {person.avatarUrl ? <Image src={person.avatarUrl} alt="" fill sizes="44px" unoptimized /> : initials(person.name)}
    </span>
  );
}

function PersonRow({ person, children }) {
  const profilePath = `/profile/${encodeURIComponent(person.username || person.id)}`;
  return (
    <article className="friends-person-row">
      <Link className="friends-person-profile" href={profilePath} aria-label={`View ${person.name}'s profile`}>
        <MemberAvatar person={person} />
        <div className="friends-person-copy">
        <strong>{person.name}</strong>
        <span>{person.username ? `@${person.username}` : "Tribe member"}</span>
        </div>
      </Link>
      <div className="friends-person-actions">{children}</div>
    </article>
  );
}

export default function FriendsClient({ currentUser, initialTab = "discover" }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");
  const clientRef = useRef(null);

  const loadRelationships = useCallback(async (supabase = clientRef.current) => {
    if (!supabase) return;
    const [friendsResult, requestsResult, blockedResult] = await Promise.all([
      supabase.from("friends").select("user_one, user_two, created_at").order("created_at", { ascending: false }),
      supabase.from("friend_requests").select("id, sender_id, receiver_id, created_at")
        .eq("status", "pending").order("created_at", { ascending: false }),
      supabase.rpc("get_my_blocked_users"),
    ]);

    if (friendsResult.error || requestsResult.error || blockedResult.error) {
      const error = friendsResult.error || requestsResult.error || blockedResult.error;
      setFeedback(error.message.includes("friend_requests") || error.message.includes("friends")
        ? "Apply the 202610020002_friends.sql migration in Supabase to enable connections."
        : error.message.includes("get_my_blocked_users")
          ? "Apply the 202610060005_user_blocks.sql migration in Supabase to enable blocking."
          : error.message);
      setLoading(false);
      return;
    }

    const friendRows = friendsResult.data ?? [];
    const requestRows = requestsResult.data ?? [];
    const blockedRows = blockedResult.data ?? [];
    const profileIds = [...new Set([
      ...friendRows.flatMap((row) => [row.user_one, row.user_two]),
      ...requestRows.flatMap((row) => [row.sender_id, row.receiver_id]),
      ...blockedRows.map((row) => row.blocked_id),
    ].filter((id) => id !== currentUser.id))];
    const profilesResult = profileIds.length
      ? await supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", profileIds)
      : { data: [], error: null };

    if (profilesResult.error) {
      setFeedback(profilesResult.error.message);
      setLoading(false);
      return;
    }

    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, {
      id: profile.id,
      name: profile.full_name || profile.username || "Tribe member",
      username: profile.username || "",
      avatarUrl: profile.avatar_url || "",
    }]));
    for (const row of blockedRows) {
      profiles.set(row.blocked_id, {
        id: row.blocked_id,
        name: row.full_name || row.username || "Tribe member",
        username: row.username || "",
        avatarUrl: row.avatar_url || "",
      });
    }
    setFriends(friendRows.map((row) => profiles.get(row.user_one === currentUser.id ? row.user_two : row.user_one)).filter(Boolean));
    setIncoming(requestRows.filter((row) => row.receiver_id === currentUser.id).map((row) => ({ ...row, person: profiles.get(row.sender_id) })).filter((row) => row.person));
    setOutgoing(requestRows.filter((row) => row.sender_id === currentUser.id).map((row) => ({ ...row, person: profiles.get(row.receiver_id) })).filter((row) => row.person));
    setBlocked(blockedRows.map((row) => profiles.get(row.blocked_id)).filter(Boolean));
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    const supabase = createClient();
    clientRef.current = supabase;
    let active = true;
    const channel = supabase.channel(`friendships:${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => {
        if (active) void loadRelationships(supabase);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        if (active) void loadRelationships(supabase);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_blocks" }, () => {
        if (active) void loadRelationships(supabase);
      })
      .subscribe();
    void loadRelationships(supabase);
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, loadRelationships]);

  useEffect(() => {
    const supabase = clientRef.current;
    if (!supabase) return undefined;
    let cancelled = false;
    const term = query.trim().replace(/[,%()_*\\]/g, " ").trim();
    const timeout = setTimeout(async () => {
      let request = supabase.from("profiles")
        .select("id, full_name, username, avatar_url")
        .neq("id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(term.length >= 2 ? 20 : 12);
      if (term.length >= 2) request = request.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`);
      const { data, error } = await request;
      if (cancelled) return;
      if (error) {
        setFeedback(error.message);
        return;
      }
      const friendIds = new Set(friends.map((person) => person.id));
      const blockedIds = new Set(blocked.map((person) => person.id));
      setPeople((data ?? []).filter((profile) => !friendIds.has(profile.id) && !blockedIds.has(profile.id)).map((profile) => ({
        id: profile.id,
        name: profile.full_name || profile.username || "Tribe member",
        username: profile.username || "",
        avatarUrl: profile.avatar_url || "",
      })));
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, currentUser.id, friends, blocked]);

  async function runAction(action, personId, requestId) {
    setBusyId(requestId || personId);
    setFeedback("");
    try {
      let result;
      if (action === "send") {
        result = await clientRef.current.rpc("send_friend_request", { p_receiver_id: personId });
      } else if (action === "accept" || action === "reject") {
        result = await clientRef.current.rpc("respond_to_friend_request", { p_request_id: requestId, p_accept: action === "accept" });
      } else if (action === "block") {
        result = await clientRef.current.rpc("block_user", { p_blocked_id: personId });
      } else if (action === "unblock") {
        result = await clientRef.current.rpc("unblock_user", { p_blocked_id: personId });
      } else if (action === "unfriend") {
        result = await clientRef.current.rpc("unfriend_user", { p_other_user_id: personId });
      } else {
        result = await clientRef.current.rpc("cancel_friend_request", { p_request_id: requestId });
      }

      if (result.error) setFeedback(describeModerationRestriction("friend_requests", result.error));
      else {
        setFeedback(action === "accept" ? "Friend request accepted." : action === "reject" ? "Request declined." : action === "cancel" ? "Request cancelled." : action === "block" ? "Member blocked. They can no longer reach your profile or contact you." : action === "unblock" ? "Member unblocked." : action === "unfriend" ? "Friend removed." : "Friend request sent.");
        if (action === "send" && result.data) {
          void fetch("/api/push/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "friend_request", id: result.data }),
          }).catch(() => {});
        }
        await loadRelationships();
      }
    } catch {
      setFeedback("Could not reach Tribe. Check your connection and try again.");
    } finally {
      setBusyId("");
    }
  }

  function confirmRelationshipAction(action, person) {
    if (action === "block" && !window.confirm(`Block ${person.name}? They will no longer be able to find or contact you.`)) return;
    if (action === "unfriend" && !window.confirm(`Remove ${person.name} from your friends?`)) return;
    void runAction(action, person.id);
  }

  function requestFor(personId, requests) {
    return requests.find((request) => request.person.id === personId);
  }

  const receivedCount = incoming.length;

  return (
    <main className="friends-page">
      <section className="friends-content">
        <span className="eyebrow">YOUR PEOPLE</span>
        <h1>Friends & connections</h1>
        <p className="friends-lede">Find people, respond to requests, and keep your circle close.</p>

        <div className="friends-toolbar">
          <div className="friends-tabs" role="tablist" aria-label="Friends views">
            <button type="button" role="tab" aria-selected={activeTab === "discover"} className={activeTab === "discover" ? "selected" : ""} onClick={() => setActiveTab("discover")}><Search size={15} />Discover</button>
            <button type="button" role="tab" aria-selected={activeTab === "requests"} className={activeTab === "requests" ? "selected" : ""} onClick={() => setActiveTab("requests")}><UserPlus size={15} />Requests{receivedCount > 0 && <span>{receivedCount}</span>}</button>
            <button type="button" role="tab" aria-selected={activeTab === "friends"} className={activeTab === "friends" ? "selected" : ""} onClick={() => setActiveTab("friends")}><UserCheck size={15} />Friends<span>{friends.length}</span></button>
            <button type="button" role="tab" aria-selected={activeTab === "blocked"} className={activeTab === "blocked" ? "selected" : ""} onClick={() => setActiveTab("blocked")}><Ban size={15} />Blocked<span>{blocked.length}</span></button>
          </div>
          {activeTab === "discover" && <label className="friends-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" aria-label="Search people" /></label>}
        </div>

        {feedback && <p className="friends-feedback" role="status">{feedback}</p>}
        {loading ? <div className="friends-empty"><LoaderCircle size={19} className="spin" />Loading your connections...</div> : <>
          {activeTab === "discover" && <section className="friends-list" aria-label="People to connect with">
            <div className="friends-list-heading"><h2>{query.trim().length >= 2 ? "Search results" : "People to meet"}</h2><span>{people.length} people</span></div>
            {people.map((person) => {
              const received = requestFor(person.id, incoming);
              const sent = requestFor(person.id, outgoing);
              return <PersonRow key={person.id} person={person}>
                {received
                  ? <><button className="friends-action primary" type="button" disabled={busyId === received.id} onClick={() => runAction("accept", person.id, received.id)}><Check size={15} />Accept</button><button className="friends-icon-action" type="button" aria-label={`Decline ${person.name}'s request`} disabled={busyId === received.id} onClick={() => runAction("reject", person.id, received.id)}><X size={16} /></button></>
                  : sent
                    ? <button className="friends-action" type="button" disabled={busyId === sent.id} onClick={() => runAction("cancel", person.id, sent.id)}><X size={15} />Requested</button>
                    : <button className="friends-action primary" type="button" disabled={busyId === person.id} onClick={() => runAction("send", person.id)}><UserPlus size={15} />Add friend</button>}
                  <button className="friends-action danger" type="button" disabled={busyId === person.id || busyId === received?.id || busyId === sent?.id} onClick={() => confirmRelationshipAction("block", person)}><Ban size={14} />Block</button>
              </PersonRow>;
            })}
            {!people.length && <p className="friends-empty-copy">{query.trim().length >= 2 ? "No members found. Try another name." : "You’re all caught up on suggestions."}</p>}
          </section>}

          {activeTab === "requests" && <div className="friends-request-groups">
            <section className="friends-list" aria-label="Received requests">
              <div className="friends-list-heading"><h2>Received</h2><span>{incoming.length} requests</span></div>
              {incoming.map((request) => <PersonRow key={request.id} person={request.person}>
                <button className="friends-action primary" type="button" disabled={busyId === request.id} onClick={() => runAction("accept", request.person.id, request.id)}><Check size={15} />Accept</button>
                <button className="friends-icon-action" type="button" aria-label={`Decline ${request.person.name}'s request`} disabled={busyId === request.id} onClick={() => runAction("reject", request.person.id, request.id)}><X size={16} /></button>
                <button className="friends-action danger" type="button" disabled={busyId === request.id} onClick={() => confirmRelationshipAction("block", request.person)}><Ban size={14} />Block</button>
              </PersonRow>)}
              {!incoming.length && <p className="friends-empty-copy">No incoming requests right now.</p>}
            </section>
            <section className="friends-list" aria-label="Sent requests">
              <div className="friends-list-heading"><h2>Sent</h2><span>{outgoing.length} requests</span></div>
              {outgoing.map((request) => <PersonRow key={request.id} person={request.person}>
                <button className="friends-action" type="button" disabled={busyId === request.id} onClick={() => runAction("cancel", request.person.id, request.id)}><X size={15} />Cancel</button>
                <button className="friends-action danger" type="button" disabled={busyId === request.id} onClick={() => confirmRelationshipAction("block", request.person)}><Ban size={14} />Block</button>
              </PersonRow>)}
              {!outgoing.length && <p className="friends-empty-copy">No sent requests waiting.</p>}
            </section>
          </div>}

          {activeTab === "friends" && <section className="friends-list" aria-label="Your friends">
            <div className="friends-list-heading"><h2>Your friends</h2><span>{friends.length} members</span></div>
            {friends.map((person) => <PersonRow key={person.id} person={person}>
              <Link className="friends-action" href="/messages"><UserCheck size={15} />Message</Link>
              <button className="friends-action" type="button" disabled={busyId === person.id} onClick={() => confirmRelationshipAction("unfriend", person)}><UserRoundX size={14} />Unfriend</button>
              <button className="friends-action danger" type="button" disabled={busyId === person.id} onClick={() => confirmRelationshipAction("block", person)}><Ban size={14} />Block</button>
            </PersonRow>)}
            {!friends.length && <p className="friends-empty-copy">Your circle starts with a friend request.</p>}
          </section>}

          {activeTab === "blocked" && <section className="friends-list" aria-label="Blocked members">
            <div className="friends-list-heading"><h2>Blocked members</h2><span>{blocked.length} people</span></div>
            {blocked.map((person) => <PersonRow key={person.id} person={person}>
              <button className="friends-action" type="button" disabled={busyId === person.id} onClick={() => runAction("unblock", person.id)}><UserPlus size={14} />Unblock</button>
            </PersonRow>)}
            {!blocked.length && <p className="friends-empty-copy">Your block list is empty.</p>}
          </section>}
        </>}
      </section>
    </main>
  );
}
