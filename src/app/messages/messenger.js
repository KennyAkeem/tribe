"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, Check, CheckCheck, ChevronDown, CircleHelp, ImagePlus,
  Info, LoaderCircle, MessageCircle, Mic, MicOff, MoreHorizontal, Paperclip,
  PenSquare, Phone, PhoneOff, Search, Send, Smile, Video, VideoOff, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeModerationRestriction } from "@/lib/moderation";

function initials(name = "Member") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function durationLabel(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function isTransientRealtimeError(error) {
  const message = typeof error === "string" ? error : error?.message || "";
  return /socket closed|websocket|network|connection|timed? out|fetch failed/i.test(message);
}

function Avatar({ person, small = false, online = false }) {
  return (
    <span className={`messenger-avatar ${small ? "small" : ""}`}>
      {person?.avatarUrl
        ? <Image src={person.avatarUrl} alt="" fill sizes={small ? "36px" : "48px"} unoptimized />
        : <span>{initials(person?.name)}</span>}
      {online && <i className="online-indicator" />}
    </span>
  );
}

function ConversationRow({ conversation, active, onSelect }) {
  const other = conversation.person;
  return (
    <button className={`conversation-row ${active ? "active" : ""}`} type="button" onClick={() => onSelect(conversation.id)}>
      <Avatar person={other} online={conversation.online} />
      <span className="conversation-row-copy">
        <span className="conversation-row-top"><strong>{other.name}</strong><time>{timeLabel(conversation.lastMessage?.created_at || conversation.updated_at)}</time></span>
        <span className={`conversation-preview ${conversation.unread ? "unread" : ""}`}>{conversation.lastMessage?.sender_id === conversation.currentUserId ? "You: " : ""}{conversation.lastMessage?.content || "Start a conversation"}</span>
      </span>
      {conversation.unread > 0 && <span className="unread-count">{conversation.unread > 9 ? "9+" : conversation.unread}</span>}
    </button>
  );
}

export default function Messenger({ currentUser, initialConversationId = null }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [draft, setDraft] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [onlineIds, setOnlineIds] = useState([]);
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callError, setCallError] = useState("");
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const clientRef = useRef(null);
  const bottomRef = useRef(null);
  const activeIdRef = useRef(null);
  const activeChannelRef = useRef(null);
  const typingTimer = useRef(null);
  const callRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceServersRef = useRef([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);
  const pendingIceRef = useRef([]);
  const callSignalHandlerRef = useRef(null);
  const callStartedAtRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callConnectionTimeoutRef = useRef(null);
  const callDisconnectTimeoutRef = useRef(null);
  const processedCallSignalsRef = useRef(new Set());
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  function updateCall(nextCall) {
    callRef.current = nextCall;
    setCall(nextCall);
  }

  async function insertCallSignal({ conversationId, callId, recipientId, type, payload = {} }) {
    const supabase = clientRef.current;
    if (!supabase) throw new Error("Messenger is not connected.");
    const { error: signalError } = await supabase.from("call_signals").insert({
      conversation_id: conversationId,
      call_id: callId,
      sender_id: currentUser.id,
      recipient_id: recipientId,
      signal_type: type,
      payload,
    });
    if (signalError) throw new Error(describeModerationRestriction("calls", signalError));
  }

  function sendCallSignal(callDetails, type, payload = {}) {
    return insertCallSignal({
      conversationId: callDetails.conversationId,
      callId: callDetails.id,
      recipientId: callDetails.otherId,
      type,
      payload,
    });
  }

  function failCall(callDetails, message) {
    const activeCall = callRef.current;
    if (activeCall?.id !== callDetails.id) return;
    setCallError(message);
    void sendCallSignal(activeCall, "end").catch(() => {});
    cleanupCall();
  }

  function armConnectionTimeout(callDetails) {
    if (callConnectionTimeoutRef.current) clearTimeout(callConnectionTimeoutRef.current);
    callConnectionTimeoutRef.current = setTimeout(() => {
      failCall(callDetails, "The call could not connect. Check your network and try again.");
    }, 30000);
  }

  function callMediaError(mediaError) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return "Calls need a secure connection. Use HTTPS on your phone or another computer; localhost works on this computer.";
    }
    if (mediaError?.name === "NotAllowedError" || mediaError?.name === "PermissionDeniedError") {
      return "Allow microphone and camera access in your browser to place this call.";
    }
    if (mediaError?.name === "NotFoundError" || mediaError?.name === "DevicesNotFoundError") {
      return "No compatible microphone or camera was found for this call.";
    }
    if (mediaError?.name === "NotReadableError") {
      return "Your microphone or camera is already being used by another app.";
    }
    return mediaError?.message || "Could not start the call. Check your microphone and camera permissions.";
  }

  async function acquireCallMedia(mediaType) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Calls need a secure connection. Use HTTPS on your phone or another computer; localhost works on this computer.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: mediaType === "video" ? {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: "user",
      } : false,
    });
  }

  async function loadCallIceServers() {
    try {
      const response = await fetch("/api/calls/ice-servers", { cache: "no-store" });
      if (!response.ok) return;
      const { iceServers } = await response.json();
      if (Array.isArray(iceServers) && iceServers.length) iceServersRef.current = iceServers;
    } catch {
      // Public STUN servers remain available if the optional relay endpoint is unreachable.
    }
  }

  function createPeerConnection(callDetails) {
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current, bundlePolicy: "max-bundle" });
    peerConnectionRef.current = connection;
    localStreamRef.current?.getTracks().forEach((track) => connection.addTrack(track, localStreamRef.current));
    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const latestCall = callRef.current;
      if (latestCall?.id === callDetails.id) {
        void sendCallSignal(latestCall, "ice_candidate", { candidate: candidate.toJSON() }).catch((signalError) => setCallError(signalError.message));
      }
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams[0]) stream.addTrack(event.track);
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };
    connection.onconnectionstatechange = () => {
      const latestCall = callRef.current;
      if (!latestCall || latestCall.id !== callDetails.id) return;
      if (connection.connectionState === "connected") {
        if (callConnectionTimeoutRef.current) clearTimeout(callConnectionTimeoutRef.current);
        if (callDisconnectTimeoutRef.current) clearTimeout(callDisconnectTimeoutRef.current);
        callConnectionTimeoutRef.current = null;
        callDisconnectTimeoutRef.current = null;
        callStartedAtRef.current ||= Date.now();
        updateCall({ ...latestCall, status: "connected" });
      } else if (connection.connectionState === "disconnected") {
        updateCall({ ...latestCall, status: "reconnecting" });
        if (!callDisconnectTimeoutRef.current) {
          callDisconnectTimeoutRef.current = setTimeout(() => {
            failCall(callDetails, "The connection was lost. Check your network and call again.");
          }, 15000);
        }
      } else if (connection.connectionState === "failed") {
        failCall(callDetails, "The call could not connect. Your network may require a TURN relay.");
      }
    };
    return connection;
  }

  async function applyPendingIce(connection) {
    const candidates = pendingIceRef.current.splice(0);
    for (const candidate of candidates) await connection.addIceCandidate(candidate);
  }

  function cleanupCall() {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (callConnectionTimeoutRef.current) clearTimeout(callConnectionTimeoutRef.current);
    if (callDisconnectTimeoutRef.current) clearTimeout(callDisconnectTimeoutRef.current);
    callTimeoutRef.current = null;
    callConnectionTimeoutRef.current = null;
    callDisconnectTimeoutRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    callStartedAtRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallDuration(0);
    setMicMuted(false);
    setCameraEnabled(true);
    setAudioPlaybackBlocked(false);
    updateCall(null);
  }

  function createCallId() {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

    const bytes = new Uint8Array(16);
    if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function startCall(mediaType, conversation = activeConversation) {
    if (!conversation || callRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCallError(callMediaError());
      return;
    }
    const nextCall = {
      id: createCallId(),
      conversationId: conversation.id,
      otherId: conversation.person.id,
      person: conversation.person,
      mediaType,
      direction: "outgoing",
      status: "requesting",
    };
    setCallError("");
    pendingIceRef.current = [];
    updateCall(nextCall);
    let stream;
    try {
      await loadCallIceServers();
      if (callRef.current?.id !== nextCall.id) return;
      stream = await acquireCallMedia(mediaType);
      if (callRef.current?.id !== nextCall.id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      await sendCallSignal(nextCall, "invite", { mediaType });
      if (callRef.current?.id !== nextCall.id) {
        await sendCallSignal(nextCall, "end").catch(() => {});
        return;
      }
      updateCall({ ...nextCall, status: "ringing" });
      callTimeoutRef.current = setTimeout(() => {
        const unansweredCall = callRef.current;
        if (unansweredCall?.id !== nextCall.id) return;
        setCallError("No answer yet. You can try again.");
        void sendCallSignal(unansweredCall, "end").catch(() => {}).finally(cleanupCall);
      }, 45000);
    } catch (mediaOrSignalError) {
      if (callRef.current?.id !== nextCall.id) {
        stream?.getTracks().forEach((track) => track.stop());
        await sendCallSignal(nextCall, "end").catch(() => {});
        return;
      }
      setCallError(mediaOrSignalError.name ? callMediaError(mediaOrSignalError) : mediaOrSignalError.message);
      cleanupCall();
    }
  }

  async function acceptCall() {
    const incomingCall = callRef.current;
    if (!incomingCall || incomingCall.direction !== "incoming") return;
    updateCall({ ...incomingCall, status: "requesting" });
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    setActiveId(incomingCall.conversationId);
    setCallError("");
    let stream;
    try {
      await loadCallIceServers();
      if (callRef.current?.id !== incomingCall.id) return;
      stream = await acquireCallMedia(incomingCall.mediaType);
      if (callRef.current?.id !== incomingCall.id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      createPeerConnection(incomingCall);
      armConnectionTimeout(incomingCall);
      updateCall({ ...incomingCall, status: "connecting" });
      await sendCallSignal(incomingCall, "accept");
    } catch (mediaOrSignalError) {
      if (callRef.current?.id !== incomingCall.id) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      setCallError(mediaOrSignalError.name ? callMediaError(mediaOrSignalError) : mediaOrSignalError.message);
      try { await sendCallSignal(incomingCall, "reject", { reason: "permission" }); } catch {}
      cleanupCall();
    }
  }

  function declineCall() {
    const incomingCall = callRef.current;
    if (!incomingCall) return;
    void sendCallSignal(incomingCall, "reject").catch(() => {});
    cleanupCall();
  }

  function endCall() {
    const currentCall = callRef.current;
    if (currentCall) void sendCallSignal(currentCall, "end").catch(() => {});
    cleanupCall();
  }

  function toggleMicrophone() {
    const muted = !micMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setMicMuted(muted);
  }

  function toggleCamera() {
    const enabled = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setCameraEnabled(enabled);
  }

  async function handleCallSignal(signal) {
    if (!signal?.id || processedCallSignalsRef.current.has(signal.id)) return;
    processedCallSignalsRef.current.add(signal.id);
    if (processedCallSignalsRef.current.size > 300) {
      processedCallSignalsRef.current.delete(processedCallSignalsRef.current.values().next().value);
    }
    if (new Date(signal.created_at).getTime() < Date.now() - 120000) {
      if (signal?.id) void clientRef.current.from("call_signals").delete().eq("id", signal.id);
      return;
    }
    const payload = signal.payload || {};
    const currentCall = callRef.current;

    if (signal.signal_type === "invite") {
      if (currentCall) {
        await insertCallSignal({ conversationId: signal.conversation_id, callId: signal.call_id, recipientId: signal.sender_id, type: "busy" });
      } else {
        const incomingCall = {
          id: signal.call_id,
          conversationId: signal.conversation_id,
          otherId: signal.sender_id,
          person: {
            id: signal.sender_id,
            name: "Tribe member",
            username: "",
            avatarUrl: "",
          },
          mediaType: payload.mediaType === "video" ? "video" : "audio",
          direction: "incoming",
          status: "incoming",
        };
        pendingIceRef.current = [];
        setCallError("");
        setActiveId(signal.conversation_id);
        updateCall(incomingCall);
        const { data: caller } = await clientRef.current.from("profiles")
          .select("id, full_name, username, avatar_url")
          .eq("id", signal.sender_id)
          .maybeSingle();
        if (callRef.current?.id !== signal.call_id) return;
        incomingCall.person = {
          ...incomingCall.person,
          name: caller?.full_name || caller?.username || "Tribe member",
          username: caller?.username || "",
          avatarUrl: caller?.avatar_url || "",
        };
        updateCall(incomingCall);
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = setTimeout(() => {
          const unansweredCall = callRef.current;
          if (unansweredCall?.id !== incomingCall.id) return;
          void sendCallSignal(unansweredCall, "end").catch(() => {}).finally(cleanupCall);
        }, 45000);
      }
    } else if (currentCall?.id === signal.call_id) {
      if (signal.signal_type === "accept" && currentCall.direction === "outgoing") {
        try {
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          const connection = peerConnectionRef.current || createPeerConnection(currentCall);
          armConnectionTimeout(currentCall);
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          updateCall({ ...currentCall, status: "connecting" });
          await sendCallSignal(currentCall, "offer", { description: connection.localDescription });
        } catch (signalError) {
          setCallError(signalError.message);
          cleanupCall();
        }
      } else if (signal.signal_type === "offer" && currentCall.direction === "incoming") {
        try {
          const connection = peerConnectionRef.current || createPeerConnection(currentCall);
          await connection.setRemoteDescription(payload.description);
          await applyPendingIce(connection);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await sendCallSignal(currentCall, "answer", { description: connection.localDescription });
        } catch (signalError) {
          setCallError(signalError.message);
          cleanupCall();
        }
      } else if (signal.signal_type === "answer" && currentCall.direction === "outgoing") {
        try {
          const connection = peerConnectionRef.current;
          if (!connection) throw new Error("The call connection was interrupted. Try calling again.");
          await connection.setRemoteDescription(payload.description);
          await applyPendingIce(connection);
        } catch (signalError) {
          setCallError(signalError.message);
          cleanupCall();
        }
      } else if (signal.signal_type === "ice_candidate" && payload.candidate) {
        try {
          const candidate = new RTCIceCandidate(payload.candidate);
          if (peerConnectionRef.current?.remoteDescription) await peerConnectionRef.current.addIceCandidate(candidate);
          else pendingIceRef.current.push(candidate);
        } catch (signalError) {
          setCallError(signalError.message);
        }
      } else if (signal.signal_type === "reject" || signal.signal_type === "busy") {
        setError(signal.signal_type === "busy" ? "That member is on another call." : "The call was declined.");
        cleanupCall();
      } else if (signal.signal_type === "end") {
        cleanupCall();
      }
    }

    void clientRef.current.from("call_signals").delete().eq("id", signal.id);
  }

  callSignalHandlerRef.current = handleCallSignal;

  const loadInbox = useCallback(async (supabase = clientRef.current) => {
    if (!supabase) return;
    const { data: rows, error: inboxError } = await supabase
      .from("conversations")
      .select("id, user_one, user_two, updated_at")
      .order("updated_at", { ascending: false });

    if (inboxError) {
      if (inboxError.message.includes("conversations")) {
        setError("Messenger tables are not installed yet. Apply the 202609290002_messenger.sql migration in Supabase.");
      } else if (isTransientRealtimeError(inboxError)) {
        setRealtimeStatus("Reconnecting");
      } else {
        setError(inboxError.message);
      }
      setLoadingInbox(false);
      return;
    }
    setError((current) => isTransientRealtimeError(current) ? "" : current);

    if (!rows?.length) {
      setConversations([]);
      setLoadingInbox(false);
      return;
    }

    const otherIds = [...new Set(rows.map((row) => row.user_one === currentUser.id ? row.user_two : row.user_one))];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", otherIds);

    if (profileError) {
      if (isTransientRealtimeError(profileError)) setRealtimeStatus("Reconnecting");
      else setError(profileError.message);
    }
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, {
      id: profile.id,
      name: profile.full_name || profile.username || "Tribe member",
      username: profile.username || "",
      avatarUrl: profile.avatar_url || "",
    }]));

    const enriched = await Promise.all(rows.map(async (row) => {
      const [latestResult, unreadResult] = await Promise.all([
        supabase.from("messages").select("id, content, sender_id, created_at, read_at")
          .eq("conversation_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", row.id).neq("sender_id", currentUser.id).is("read_at", null),
      ]);
      const otherId = row.user_one === currentUser.id ? row.user_two : row.user_one;
      return {
        ...row,
        person: profileMap.get(otherId) || { id: otherId, name: "Tribe member", username: "", avatarUrl: "" },
        lastMessage: latestResult.data,
        unread: unreadResult.count || 0,
        currentUserId: currentUser.id,
        online: false,
      };
    }));

    setConversations(enriched.sort((a, b) => new Date(b.lastMessage?.created_at || b.updated_at) - new Date(a.lastMessage?.created_at || a.updated_at)));
    setLoadingInbox(false);
  }, [currentUser.id]);

  const loadMessages = useCallback(async (conversationId, supabase = clientRef.current) => {
    if (!conversationId || !supabase) return;
    setLoadingMessages(true);
    const { data, error: messagesError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, created_at, read_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (messagesError) {
      if (isTransientRealtimeError(messagesError)) setRealtimeStatus("Reconnecting");
      else setError(messagesError.message);
    }
    else {
      setError((current) => isTransientRealtimeError(current) ? "" : current);
      setMessages(data ?? []);
      const unreadIds = (data ?? []).filter((message) => message.sender_id !== currentUser.id && !message.read_at).map((message) => message.id);
      if (unreadIds.length) {
        await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
      }
    }
    setLoadingMessages(false);
    await loadInbox(supabase);
  }, [currentUser.id, loadInbox]);

  useEffect(() => {
    const supabase = createClient();
    clientRef.current = supabase;
    let active = true;
    const channel = supabase.channel(`messenger:${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (!active) return;
        void loadInbox(supabase);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadInbox(supabase))
      .subscribe((status, subscriptionError) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setRealtimeStatus("Live");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setRealtimeStatus("Reconnecting");
        }
      });
    void loadInbox(supabase);
    return () => {
      active = false;
      void supabase.removeChannel(channel);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [currentUser.id, loadInbox, loadMessages]);

  useEffect(() => {
    const supabase = clientRef.current;
    if (!supabase) return undefined;

    let active = true;
    let recoveryTimer;
    function recoverConnection() {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        if (!active) return;
        void (async () => {
          await supabase.auth.getSession();
          if (!supabase.realtime.isConnected() && !supabase.realtime.isConnecting()) {
            setRealtimeStatus("Reconnecting");
            supabase.realtime.connect();
          }
          const conversationId = activeIdRef.current;
          if (conversationId) void loadMessages(conversationId, supabase);
          else void loadInbox(supabase);
        })();
      }, 200);
    }

    document.addEventListener("visibilitychange", recoverConnection);
    window.addEventListener("focus", recoverConnection);
    window.addEventListener("online", recoverConnection);
    window.addEventListener("pageshow", recoverConnection);
    return () => {
      active = false;
      clearTimeout(recoveryTimer);
      document.removeEventListener("visibilitychange", recoverConnection);
      window.removeEventListener("focus", recoverConnection);
      window.removeEventListener("online", recoverConnection);
      window.removeEventListener("pageshow", recoverConnection);
    };
  }, [loadInbox, loadMessages]);

  useEffect(() => {
    const supabase = clientRef.current;
    if (!supabase) return undefined;
    let active = true;
    const channel = supabase.channel(`call-signals:${currentUser.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `recipient_id=eq.${currentUser.id}`,
      }, ({ new: signal }) => {
        if (active) void callSignalHandlerRef.current?.(signal).catch((signalError) => setCallError(signalError.message));
      })
      .subscribe((status, subscriptionError) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          void supabase.from("call_signals").select("*")
            .eq("recipient_id", currentUser.id)
            .gte("created_at", new Date(Date.now() - 120000).toISOString())
            .order("created_at", { ascending: true })
            .then(async ({ data, error: queryError }) => {
              if (!active) return;
              if (queryError) {
                setCallError("Could not recover missed call signals. Check the calls migration.");
                return;
              }
              for (const signal of data ?? []) await callSignalHandlerRef.current?.(signal);
            })
            .catch((signalError) => setCallError(signalError.message));
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          if (callRef.current) setCallError("Call connection interrupted. Reconnecting...");
        }
      });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      if (!remoteStream) setAudioPlaybackBlocked(false);
      else void remoteAudioRef.current.play().then(() => setAudioPlaybackBlocked(false)).catch(() => setAudioPlaybackBlocked(true));
    }
  }, [localStream, remoteStream, call]);

  useEffect(() => {
    if (!call || call.status !== "connected") return undefined;
    const interval = setInterval(() => {
      if (callStartedAtRef.current) setCallDuration(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call]);

  useEffect(() => () => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  useEffect(() => {
    const supabase = clientRef.current;
    if (!activeId || !supabase) {
      setOnlineIds([]);
      setTyping(false);
      return;
    }
    const channel = supabase.channel(`conversation:${activeId}`, {
      config: { presence: { key: currentUser.id } },
    });
    let active = true;
    activeChannelRef.current = channel;
    channel.on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${activeId}`,
    }, () => {
      if (active) void loadMessages(activeId, supabase);
    });
    channel.on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${activeId}`,
    }, ({ new: updatedMessage }) => {
      if (!active || !updatedMessage?.id) return;
      setMessages((current) => current.map((message) => message.id === updatedMessage.id
        ? { ...message, ...updatedMessage }
        : message));
    });
    channel.on("presence", { event: "sync" }, () => {
      setOnlineIds(Object.keys(channel.presenceState()).filter((id) => id !== currentUser.id));
    });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.userId === currentUser.id) return;
      setTyping(Boolean(payload?.typing));
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (payload?.typing) typingTimer.current = setTimeout(() => setTyping(false), 2500);
    });
    let hasJoined = false;
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
        if (hasJoined) void loadMessages(activeId, supabase);
        hasJoined = true;
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        setRealtimeStatus("Reconnecting");
      }
    });
    return () => {
      active = false;
      if (activeChannelRef.current === channel) activeChannelRef.current = null;
      void supabase.removeChannel(channel);
      setOnlineIds([]);
      setTyping(false);
    };
  }, [activeId, currentUser.id, loadMessages]);

  useEffect(() => {
    const supabase = clientRef.current;
    const term = query.trim();
    if (!supabase || term.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const safeTerm = term.replace(/[,%()]/g, " ").trim();
      if (safeTerm.length < 2) return;
      const { data, error: searchError } = await supabase.from("profiles")
        .select("id, full_name, username, avatar_url")
        .or(`full_name.ilike.%${safeTerm}%,username.ilike.%${safeTerm}%`)
        .neq("id", currentUser.id)
        .limit(12);
      if (cancelled) return;
      if (searchError) setError(searchError.message);
      setResults((data ?? []).map((profile) => ({
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
  }, [query, currentUser.id]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const filteredConversations = conversations.filter((conversation) => activeTab === "all" || conversation.unread > 0);

  async function startConversation(person) {
    setError("");
    const { data, error: startError } = await clientRef.current.rpc("create_direct_conversation", { p_other_user_id: person.id });
    if (startError) {
      setError(startError.message.includes("create_direct_conversation")
        ? "Apply the Messenger database migration before starting a chat."
        : startError.message);
      return;
    }
    setQuery("");
    setResults([]);
    setLoadingInbox(true);
    await loadInbox();
    setActiveId(data);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    setDraft("");
    const optimistic = {
      id: `pending-${Date.now()}`,
      conversation_id: activeId,
      sender_id: currentUser.id,
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);
    const { data, error: sendError } = await clientRef.current.from("messages")
      .insert({ conversation_id: activeId, sender_id: currentUser.id, content })
      .select("id, conversation_id, sender_id, content, created_at, read_at")
      .single();
    setSending(false);
    if (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(content);
      setError(describeModerationRestriction("messaging", sendError));
      return;
    }
    setMessages((current) => current.map((message) => message.id === optimistic.id ? data : message));
    void fetch("/api/push/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", id: data.id }),
    }).catch(() => {});
    await loadInbox();
    void activeChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUser.id, typing: false } });
  }

  function updateDraft(value) {
    setDraft(value);
    if (!activeId || !clientRef.current) return;
    void activeChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUser.id, typing: Boolean(value.trim()) } });
  }

  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unread, 0);

  return (
    <main className="messenger-app">
      <div className={`messenger-layout ${activeId ? "chat-open" : ""}`}>
        <aside className="inbox-panel">
          <div className="inbox-heading"><div><span className="eyebrow">YOUR CONVERSATIONS</span><h1>Messages{unreadTotal > 0 && <span className="inbox-total-unread">{unreadTotal}</span>}</h1></div><button className="messenger-icon-button" type="button" title="New message" aria-label="New message" onClick={() => document.getElementById("message-search")?.focus()}><PenSquare size={19} /></button></div>
          <label className="message-search"><Search size={16} /><input id="message-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or start a new chat" aria-label="Search conversations or people" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</label>
          <div className="inbox-tabs" role="tablist" aria-label="Conversation filter"><button type="button" role="tab" aria-selected={activeTab === "all"} className={activeTab === "all" ? "selected" : ""} onClick={() => setActiveTab("all")}>All</button><button type="button" role="tab" aria-selected={activeTab === "unread"} className={activeTab === "unread" ? "selected" : ""} onClick={() => setActiveTab("unread")}>Unread{unreadTotal > 0 && <span>{unreadTotal}</span>}</button></div>
          <div className="conversation-list">
            {query.trim().length >= 2 ? <>
              <span className="inbox-section-label">PEOPLE</span>
              {results.map((person) => <button key={person.id} className="person-result" type="button" onClick={() => startConversation(person)}><Avatar person={person} /><span><strong>{person.name}</strong><small>{person.username ? `@${person.username}` : "Start a conversation"}</small></span><MessageCircle size={17} /></button>)}
              {!results.length && <p className="inbox-empty">Search by name or username to find someone.</p>}
            </> : loadingInbox ? <div className="inbox-loading"><span className="loading-mark" /> Loading conversations</div>
              : filteredConversations.length ? filteredConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={{ ...conversation, online: onlineIds.includes(conversation.person.id) }} active={conversation.id === activeId} onSelect={setActiveId} />)
                : <div className="inbox-empty"><span className="empty-message-icon"><MessageCircle size={20} /></span><strong>{error ? "Messenger setup needed" : activeTab === "unread" ? "No unread messages" : "Your inbox is ready"}</strong><p>{error || (activeTab === "unread" ? "You’re all caught up." : "Search for a person above to start a conversation.")}</p></div>}
          </div>
          <div className="inbox-footer"><span className={`inbox-online-dot ${realtimeStatus !== "Live" ? "offline" : ""}`} />{realtimeStatus === "Live" ? "Live messages enabled" : realtimeStatus === "Connecting" ? "Connecting to live messages" : realtimeStatus === "Reconnecting" ? "Reconnecting to live messages" : "Live updates unavailable"}</div>
        </aside>

        <section className="conversation-panel" aria-label="Conversation">
          {activeConversation ? <>
            <header className="chat-header">
              <button className="mobile-back" type="button" aria-label="Back to inbox" onClick={() => setActiveId(null)}><ArrowLeft size={19} /></button>
              <Avatar person={activeConversation.person} online={onlineIds.includes(activeConversation.person.id)} />
              <div className="chat-header-person"><strong>{activeConversation.person.name}</strong><span>{onlineIds.includes(activeConversation.person.id) ? "Active now" : activeConversation.person.username ? `@${activeConversation.person.username}` : "Tribe member"}</span></div>
              <div className="chat-header-actions"><button type="button" className="messenger-icon-button" aria-label="Start audio call" title="Audio call" disabled={Boolean(call)} onClick={() => void startCall("audio")}><Phone size={18} /></button><button type="button" className="messenger-icon-button" aria-label="Start video call" title="Video call in HD" disabled={Boolean(call)} onClick={() => void startCall("video")}><Video size={19} /></button><button type="button" className={`messenger-icon-button ${showDetails ? "pressed" : ""}`} aria-label="Conversation details" title="Conversation details" onClick={() => setShowDetails((value) => !value)}><Info size={19} /></button></div>
            </header>
            <div className="chat-scroll-area">
              <div className="chat-intro"><Avatar person={activeConversation.person} /><strong>{activeConversation.person.name}</strong><span>{activeConversation.person.username ? `@${activeConversation.person.username}` : "You’re connected on Tribe"}</span></div>
              {loadingMessages ? <div className="chat-loading">Loading messages...</div> : messages.length ? <div className="message-stream">{messages.map((message, index) => {
                const mine = message.sender_id === currentUser.id;
                const previous = messages[index - 1];
                const next = messages[index + 1];
                const groupedBefore = previous?.sender_id === message.sender_id && Date.now() - new Date(message.created_at).getTime() < 5 * 60 * 1000 && message.created_at.slice(0, 10) === previous.created_at.slice(0, 10);
                const groupedAfter = next?.sender_id === message.sender_id && Date.now() - new Date(next.created_at).getTime() < 5 * 60 * 1000 && next.created_at.slice(0, 10) === message.created_at.slice(0, 10);
                return <div className={`message-line ${mine ? "mine" : "theirs"} ${groupedBefore ? "grouped-before" : ""}`} key={message.id}>
                  <div className="message-bubble">{message.content}</div>
                  <div className="message-meta">
                    <time className="message-time" dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                    {mine && !groupedAfter && <span className={`message-receipt ${message.read_at ? "is-read" : ""}`} aria-label={message.read_at ? "Read" : "Sent"} title={message.read_at ? "Read" : "Sent"}>{message.pending ? <Check size={13} /> : message.read_at ? <CheckCheck size={14} /> : <Check size={13} />}</span>}
                  </div>
                </div>;
              })}</div> : <div className="chat-first-message">Say hello to start the conversation.</div>}
              {typing && <div className="typing-indicator"><span /><span /><span /> <small>{activeConversation.person.name.split(" ")[0]} is typing</small></div>}
              <div ref={bottomRef} />
            </div>
            <form className="message-composer" onSubmit={sendMessage}>
              <div className="message-composer-tools"><button type="button" className="messenger-icon-button" title="Add attachment" aria-label="Add attachment" onClick={() => setError("File attachments are coming soon.")}><Paperclip size={19} /></button><button type="button" className="messenger-icon-button" title="Add photo" aria-label="Add photo" onClick={() => setError("Photo messages are coming soon.")}><ImagePlus size={19} /></button></div>
              <textarea value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder="Message..." aria-label="Message" rows={1} maxLength={4000} />
              <button type="button" className="messenger-icon-button emoji-button" aria-label="Add emoji" title="Add emoji" onClick={() => updateDraft((value) => `${value}🙂`)}><Smile size={19} /></button>
              <button type="submit" className="send-message-button" aria-label="Send message" disabled={!draft.trim() || sending}><Send size={17} /></button>
            </form>
          </> : <div className="conversation-empty"><div className="conversation-empty-art"><MessageCircle size={29} /></div><h2>Your conversations belong here.</h2><p>Pick a conversation or search for someone to start a private chat.</p><button type="button" onClick={() => document.getElementById("message-search")?.focus()}><PenSquare size={15} /> New message</button></div>}
        </section>

        {activeConversation && showDetails && <aside className="details-panel"><button type="button" aria-label="Close details" className="messenger-icon-button details-close" onClick={() => setShowDetails(false)}><X size={18} /></button><Avatar person={activeConversation.person} /><h2>{activeConversation.person.name}</h2><span>{activeConversation.person.username ? `@${activeConversation.person.username}` : "Tribe member"}</span><div className="details-rule" /><p><CircleHelp size={16} /> Messages are private between you and this member.</p></aside>}
      </div>

      {call && <div className="call-overlay" role="dialog" aria-modal="true" aria-label={`${call.mediaType === "video" ? "Video" : "Audio"} call with ${call.person.name}`}>
        <section className={`call-window ${call.mediaType}`}>
          <header className="call-window-header">
            <div><span className="eyebrow">{call.direction === "incoming" ? "INCOMING CALL" : call.mediaType === "video" ? "HD VIDEO CALL" : "AUDIO CALL"}</span><h2>{call.person.name}</h2><p>{call.status === "incoming" ? `Incoming ${call.mediaType} call` : call.status === "requesting" ? "Connecting to your devices..." : call.status === "ringing" ? "Ringing..." : call.status === "connected" ? "Connected" : call.status === "reconnecting" ? "Reconnecting..." : "Connecting..."}</p></div>
            {call.status === "connected" && <time>{durationLabel(callDuration)}</time>}
          </header>
          {call.mediaType === "video" ? <div className="call-video-stage">
            <video ref={remoteVideoRef} className={`call-remote-video ${remoteStream ? "has-stream" : ""}`} autoPlay playsInline muted />
            {!remoteStream && <div className="call-waiting"><Avatar person={call.person} /><strong>{call.person.name}</strong><span>{call.status === "incoming" ? "Ready when you are" : "Waiting for video..."}</span></div>}
            {localStream?.getVideoTracks().length > 0 && <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />}
          </div> : <div className="call-audio-stage">
            <Avatar person={call.person} />
            <strong>{call.person.name}</strong>
            <span>{call.status === "connected" ? "Audio connected" : call.status === "incoming" ? "Incoming audio call" : "Waiting for answer..."}</span>
          </div>}
          <audio ref={remoteAudioRef} className="call-remote-audio" autoPlay playsInline />
          {audioPlaybackBlocked && remoteStream && <button className="call-audio-enable" type="button" onClick={() => void remoteAudioRef.current?.play().then(() => setAudioPlaybackBlocked(false)).catch(() => setAudioPlaybackBlocked(true))}>Tap to hear audio</button>}
          {callError && <p className="call-error" role="alert">{callError}</p>}
          <div className="call-controls">
            {call.status === "incoming" ? <>
              <button className="call-control decline" type="button" onClick={() => void declineCall()}><PhoneOff size={18} /><span>Decline</span></button>
              <button className="call-control accept" type="button" onClick={() => void acceptCall()}><Phone size={18} /><span>Accept</span></button>
            </> : <>
              {call.status === "connected" && <>
                <button className={`call-control ${micMuted ? "toggled" : ""}`} type="button" aria-label={micMuted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMicrophone}>{micMuted ? <MicOff size={19} /> : <Mic size={19} />}<span>{micMuted ? "Unmute" : "Mute"}</span></button>
                {call.mediaType === "video" && <button className={`call-control ${!cameraEnabled ? "toggled" : ""}`} type="button" aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={toggleCamera}>{cameraEnabled ? <Video size={19} /> : <VideoOff size={19} />}<span>{cameraEnabled ? "Camera on" : "Camera off"}</span></button>}
              </>}
              {call.status === "requesting" && <LoaderCircle size={20} className="spin call-loader" />}
              <button className="call-control decline" type="button" aria-label="End call" onClick={() => void endCall()}><PhoneOff size={18} /><span>{call.status === "connected" ? "End call" : "Cancel"}</span></button>
            </>}
          </div>
        </section>
      </div>}

      {callError && !call && <div className="messenger-toast" role="status"><Info size={16} /><span>{callError}</span><button type="button" aria-label="Dismiss" onClick={() => setCallError("")}><X size={15} /></button></div>}
      {error && <div className="messenger-toast" role="status"><Info size={16} /><span>{error}</span><button type="button" aria-label="Dismiss" onClick={() => setError("")}><X size={15} /></button></div>}
    </main>
  );
}