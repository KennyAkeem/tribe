"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, MessageCircle, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function relativeTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function notificationText(notification) {
  const name = notification.actor?.name || "A Tribe member";
  if (notification.type === "friend_request") return `${name} sent you a friend request.`;
  if (notification.type === "friend_accepted") return `${name} accepted your friend request.`;
  if (notification.type === "message") return `${name} sent you a message.`;
  if (notification.type === "like") return `${name} appreciated your post.`;
  return `${name} commented on your post.`;
}

function notificationHref(notification) {
  if (notification.type === "friend_request") return "/friends?tab=requests";
  if (notification.type === "friend_accepted") return "/friends?tab=friends";
  if (notification.type === "message" && notification.conversationId) {
    return `/messages?conversation=${encodeURIComponent(notification.conversationId)}`;
  }
  return "/";
}

function NotificationIcon({ type, size = 16 }) {
  if (type === "message") return <MessageCircle size={size} />;
  if (type === "friend_request" || type === "friend_accepted") return <UserPlus size={size} />;
  if (type === "like") return <Check size={size} />;
  return <MessageCircle size={size} />;
}

export default function NotificationCenter() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const toastTimerRef = useRef(null);
  const clientRef = useRef(null);

  const loadNotifications = useCallback(async (supabase, toastId) => {
    const { data, error: queryError } = await supabase.from("notifications")
      .select("id, actor_id, notification_type, entity_id, post_id, conversation_id, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (queryError) {
      setError(queryError.message.includes("notifications")
        ? "Apply the 202610020003_notifications.sql migration to enable alerts."
        : queryError.message);
      return;
    }

    const actorIds = [...new Set((data ?? []).map((item) => item.actor_id).filter(Boolean))];
    const { data: profiles, error: profileError } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", actorIds)
      : { data: [], error: null };
    if (profileError) setError(profileError.message);
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, {
      name: profile.full_name || profile.username || "Tribe member",
      avatarUrl: profile.avatar_url || "",
    }]));

    const hydrated = (data ?? []).map((item) => ({
      id: item.id,
      actor: profileMap.get(item.actor_id) || null,
      type: item.notification_type,
      entityId: item.entity_id,
      postId: item.post_id,
      conversationId: item.conversation_id,
      createdAt: item.created_at,
      readAt: item.read_at,
    }));
    setNotifications(hydrated);
    if (toastId) {
      const fresh = hydrated.find((item) => item.id === toastId);
      if (fresh) setToast(fresh);
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return undefined;
    const supabase = createClient();
    clientRef.current = supabase;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id || null);
    });
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setUserId(user?.id || null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const supabase = clientRef.current;
    if (!userId || !supabase) {
      setNotifications([]);
      setToast(null);
      setOpen(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    void loadNotifications(supabase).finally(() => {
      if (active) setLoading(false);
    });
    const channel = supabase.channel(`notifications:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      }, (payload) => {
        if (!active || !payload.new?.id) return;
        const item = {
          id: payload.new.id,
          type: payload.new.notification_type,
          entityId: payload.new.entity_id,
          postId: payload.new.post_id,
          conversationId: payload.new.conversation_id,
          createdAt: payload.new.created_at,
          actor: null,
          readAt: null,
        };
        setToast(item);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 8000);
        void loadNotifications(supabase, payload.new.id);
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  async function markRead(notification) {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    const { error: updateError } = await clientRef.current.from("notifications")
      .update({ read_at: readAt }).eq("id", notification.id);
    if (updateError) {
      setError(updateError.message);
      void loadNotifications(clientRef.current);
    }
  }

  async function openNotification(notification) {
    setOpen(false);
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    await markRead(notification);
    router.push(notificationHref(notification));
  }

  async function markAllRead() {
    if (!unreadCount) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    const { error: updateError } = await clientRef.current.from("notifications")
      .update({ read_at: readAt }).is("read_at", null);
    if (updateError) {
      setError(updateError.message);
      void loadNotifications(clientRef.current);
    }
  }

  if (!userId) return null;

  return (
    <div className="notification-center" ref={rootRef}>
      <button className="notification-trigger" type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={19} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && <section className="notification-panel" aria-label="Notifications">
        <header className="notification-panel-header">
          <div><h2>Notifications</h2><span>{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</span></div>
          {unreadCount > 0 && <button type="button" aria-label="Mark all notifications as read" title="Mark all as read" onClick={markAllRead}><CheckCheck size={16} /></button>}
        </header>
        {error && <p className="notification-error" role="status">{error}</p>}
        <div className="notification-list">
          {notifications.map((notification) => <button className={`notification-item ${notification.readAt ? "read" : "unread"}`} type="button" key={notification.id} onClick={() => void openNotification(notification)}>
            <span className={`notification-item-icon ${notification.type}`}><NotificationIcon type={notification.type} /></span>
            <span className="notification-item-copy"><span>{notificationText(notification)}</span><time>{relativeTime(notification.createdAt)}</time></span>
            {!notification.readAt && <i aria-label="Unread" />}
          </button>)}
          {!notifications.length && <p className="notification-empty">{loading ? "Loading notifications..." : "New activity will show up here."}</p>}
        </div>
      </section>}

      {toast && <div className="notification-toast" role="status" aria-live="polite">
        <button className="notification-toast-content" type="button" onClick={() => void openNotification(toast)}>
          <span className={`notification-item-icon ${toast.type}`}><NotificationIcon type={toast.type} /></span>
          <span><strong>{toast.actor?.name || "New activity"}</strong><small>{notificationText(toast)}</small></span>
        </button>
        <button className="notification-toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => { setToast(null); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }}><X size={15} /></button>
      </div>}
    </div>
  );
}
