"use client";

import { useDeferredValue, useState } from "react";
import Image from "next/image";
import { BadgeCheck, Check, Clock3, Flag, Search, ShieldAlert, ShieldCheck, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import VideoPlayer from "@/components/video-player";
import { addSignedMediaUrls } from "@/lib/supabase/post-media";

const restrictionOptions = [
  ["posting", "Posting"], ["commenting", "Commenting"], ["appreciating", "Appreciating"],
  ["messaging", "Messaging"], ["friend_requests", "Friend requests"], ["calls", "Calls"],
];

function dateLabel(value) {
  return value
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(value))
    : "-";
}

export default function AdminDashboard({ initialUsers, initialVerifications, initialReports, initialPosts, initialHasMorePosts, initialAudit, loadError }) {
  const [users, setUsers] = useState(initialUsers);
  const [verifications, setVerifications] = useState(initialVerifications);
  const [reports, setReports] = useState(initialReports);
  const [posts, setPosts] = useState(initialPosts);
  const [hasMorePosts, setHasMorePosts] = useState(initialHasMorePosts);
  const [audit, setAudit] = useState(initialAudit);
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [status, setStatus] = useState("restricted");
  const [restrictionValues, setRestrictionValues] = useState([]);
  const [duration, setDuration] = useState("permanent");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState({});
  const [revealed, setRevealed] = useState({});
  const [documents, setDocuments] = useState({});
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());
  const visibleUsers = users.filter((user) => [user.full_name, user.username, user.email].some((value) => value?.toLowerCase().includes(search)));
  const openReports = reports.filter((report) => ["open", "reviewing"].includes(report.status)).length;
  const flaggedPosts = posts.filter((post) => post.is_flagged).length;

  function showError(error) {
    setNotice(error?.message || "The admin action could not be completed.");
  }

  async function saveModeration(event) {
    event.preventDefault();
    if (!selectedUser) return;
    setBusyId(selectedUser.user_id);
    const expiresAt = duration === "permanent" ? null : new Date(Date.now() + Number(duration) * 86400000).toISOString();
    const { error } = await createClient().rpc("admin_set_moderation", {
      p_user_id: selectedUser.user_id,
      p_status: status,
      p_restrictions: status === "restricted" ? restrictionValues : [],
      p_reason: reason.trim(),
      p_expires_at: expiresAt,
    });
    if (error) showError(error);
    else {
      setUsers((current) => current.map((user) => user.user_id === selectedUser.user_id ? {
        ...user, moderation_status: status, restrictions: status === "restricted" ? restrictionValues : [],
        moderation_reason: reason.trim(), moderation_expires_at: expiresAt,
      } : user));
      setAudit((current) => [{ id: `local-${Date.now()}`, action: "moderation_changed", target_user_id: selectedUser.user_id, created_at: new Date().toISOString() }, ...current]);
      setSelectedUser(null);
      setNotice("Account status updated.");
    }
    setBusyId("");
  }

  async function reviewVerification(request, approve) {
    setBusyId(request.request_id);
    try {
      const response = await fetch(`/api/admin/verification/${request.request_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: notes[request.request_id] || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not review this request.");
      setVerifications((current) => current.filter((item) => item.request_id !== request.request_id));
      setUsers((current) => current.map((user) => user.user_id === request.user_id ? { ...user, is_verified: approve } : user));
      setAudit((current) => [{ id: `local-${Date.now()}`, action: "verification_reviewed", target_user_id: request.user_id, created_at: new Date().toISOString() }, ...current]);
      setNotice(approve ? "Verification approved." : "Verification declined.");
    } catch (error) {
      showError(error);
    } finally {
      setBusyId("");
    }
  }

  async function revealDocuments(request) {
    setBusyId(request.request_id);
    try {
      const response = await fetch(`/api/admin/verification/${request.request_id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load ID photos.");
      setDocuments((current) => ({ ...current, [request.request_id]: result }));
    } catch (error) {
      showError(error);
    } finally {
      setBusyId("");
    }
  }

  async function revealIdentity(request) {
    setBusyId(request.request_id);
    try {
      const response = await fetch(`/api/admin/verification/${request.request_id}/identity`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reveal ID.");
      setRevealed((current) => ({ ...current, [request.request_id]: result.governmentId }));
    } catch (error) {
      showError(error);
    } finally {
      setBusyId("");
    }
  }

  async function updateReport(report, nextStatus) {
    setBusyId(report.report_id);
    const { error } = await createClient().rpc("admin_resolve_report", {
      p_report_id: report.report_id, p_status: nextStatus, p_note: notes[report.report_id] || "",
    });
    if (error) showError(error);
    else {
      setReports((current) => current.map((item) => item.report_id === report.report_id ? { ...item, status: nextStatus, admin_note: notes[report.report_id] || "" } : item));
      setAudit((current) => [{ id: `local-${Date.now()}`, action: "report_updated", target_user_id: report.target_user_id, created_at: new Date().toISOString() }, ...current]);
      setNotice(`Report marked ${nextStatus}.`);
    }
    setBusyId("");
  }

  async function updatePostFlag(post, isFlagged) {
    setBusyId(post.post_id);
    const note = notes[post.post_id] || "";
    const { error } = await createClient().rpc("admin_set_post_flag", {
      p_post_id: post.post_id, p_is_flagged: isFlagged, p_note: note,
    });
    if (error) showError(error);
    else {
      setPosts((current) => current.map((item) => item.post_id === post.post_id ? { ...item, is_flagged: isFlagged, flag_note: isFlagged ? note : "" } : item));
      setAudit((current) => [{ id: `local-${Date.now()}`, action: isFlagged ? "post_flagged" : "post_unflagged", target_user_id: post.author_id, created_at: new Date().toISOString() }, ...current]);
      setNotice(isFlagged ? "Post flagged for moderation." : "Post flag cleared.");
    }
    setBusyId("");
  }

  async function loadMorePosts() {
    setBusyId("posts-more");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_list_posts", { p_offset: posts.length });
    if (error) {
      showError(error);
    } else {
      const postsWithMedia = await addSignedMediaUrls(supabase, data || []);
      setPosts((current) => [...current, ...postsWithMedia]);
      setHasMorePosts((data || []).length === 100);
    }
    setBusyId("");
  }

  async function deleteAdminPost(post) {
    if (!window.confirm("Permanently delete this post? This also removes its comments and likes.")) return;
    setBusyId(post.post_id);
    const { data: mediaPath, error } = await createClient().rpc("admin_delete_post", { p_post_id: post.post_id });
    if (error) {
      showError(error);
    } else {
      setPosts((current) => current.filter((item) => item.post_id !== post.post_id));
      if (mediaPath) {
        const { error: mediaError } = await createClient().storage.from("post-media").remove([mediaPath]);
        setNotice(mediaError ? "Post deleted, but its media file could not be removed." : "Post deleted.");
      } else {
        setNotice("Post deleted.");
      }
      setAudit((current) => [{ id: `local-${Date.now()}`, action: "post_deleted", target_user_id: post.author_id, created_at: new Date().toISOString() }, ...current]);
    }
    setBusyId("");
  }

  return <div className="admin-content">
    <header className="admin-heading"><div><span className="eyebrow">TRIBE OPERATIONS</span><h1>Admin console</h1><p>Manage accounts, verification, posts, and user reports.</p></div><span className="admin-access-label"><ShieldCheck size={15} /> Admin</span></header>
    {loadError && <p className="admin-error" role="alert">{loadError}. Apply migrations 009–012 if the admin tables are missing.</p>}
    <div className="admin-stats">
      <div><Users size={17} /><span>Users</span><strong>{users.length}</strong></div>
      <div><BadgeCheck size={17} /><span>Verification queue</span><strong>{verifications.length}</strong></div>
      <div><Flag size={17} /><span>Open reports</span><strong>{openReports}</strong></div>
      <div><ShieldAlert size={17} /><span>Flagged posts</span><strong>{flaggedPosts}</strong></div>
    </div>
    <nav className="admin-tabs" role="tablist" aria-label="Admin sections">
      <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "selected" : ""} onClick={() => setTab("users")}><Users size={15} />Users</button>
      <button type="button" role="tab" aria-selected={tab === "verification"} className={tab === "verification" ? "selected" : ""} onClick={() => setTab("verification")}><BadgeCheck size={15} />Verification <span>{verifications.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "reports"} className={tab === "reports" ? "selected" : ""} onClick={() => setTab("reports")}><Flag size={15} />Reports <span>{openReports}</span></button>
      <button type="button" role="tab" aria-selected={tab === "posts"} className={tab === "posts" ? "selected" : ""} onClick={() => setTab("posts")}><ShieldAlert size={15} />Posts <span>{flaggedPosts}</span></button>
      <button type="button" role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "selected" : ""} onClick={() => setTab("audit")}><Clock3 size={15} />Audit log</button>
    </nav>

    {tab === "users" && <>
      <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, or email" /></label>
      <div className="admin-user-list">
        {visibleUsers.map((user) => <article className="admin-user-row" key={user.user_id}>
          <div className="admin-user-main"><strong>{user.full_name || "Member"}{user.is_verified && <BadgeCheck className="verified-badge" size={14} />}</strong><span>{user.username ? `@${user.username} · ` : ""}{user.email}</span><small>Joined {dateLabel(user.auth_created_at)} · {user.open_reports} open reports</small></div>
          <span className={`admin-status ${user.moderation_status}`}>{user.moderation_status}</span>
          <button type="button" className="admin-manage-button" onClick={() => { setSelectedUser(user); setStatus(user.moderation_status === "active" ? "restricted" : user.moderation_status); setRestrictionValues(user.restrictions || []); setReason(user.moderation_reason || ""); setDuration(user.moderation_expires_at ? "7" : "permanent"); }}>Manage</button>
        </article>)}
        {!visibleUsers.length && <p className="admin-empty">No users match this search.</p>}
      </div>
      {selectedUser && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null); }}>
        <section className="admin-manage-panel" role="dialog" aria-modal="true" aria-labelledby="manage-user-heading">
          <header><div><span className="eyebrow">ACCOUNT MODERATION</span><h2 id="manage-user-heading">{selectedUser.full_name || selectedUser.email}</h2></div><button type="button" aria-label="Close" onClick={() => setSelectedUser(null)}><X size={18} /></button></header>
          <form onSubmit={(event) => void saveModeration(event)}>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="restricted">Restricted actions</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label>
            {status === "restricted" && <fieldset><legend>Restrict</legend>{restrictionOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={restrictionValues.includes(value)} onChange={(event) => setRestrictionValues((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} />{label}</label>)}</fieldset>}
            <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="permanent">Until changed</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
            <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} required={status !== "active"} /></label>
            <button className="admin-primary-button" type="submit" disabled={busyId === selectedUser.user_id}>{busyId === selectedUser.user_id ? "Saving..." : "Save moderation"}</button>
          </form>
        </section>
      </div>}
    </>}

    {tab === "verification" && <section className="admin-review-list">
      {verifications.map((request) => <article className="admin-review-card surface" key={request.request_id}>
        <header><div><span className="eyebrow">VERIFICATION REQUEST</span><h2>{request.full_name || request.email}</h2><p>{request.username ? `@${request.username} · ` : ""}{request.email} · {dateLabel(request.created_at)}</p></div><span className="admin-status pending">pending</span></header>
        <dl><div><dt>Phone</dt><dd>{request.phone_number}</dd></div><div><dt>Location</dt><dd>{request.country_name}</dd></div><div><dt>ID type</dt><dd>{request.government_id_type.replaceAll("_", " ")}</dd></div></dl>
        <div className="admin-id-reveal">{revealed[request.request_id] ? <><strong>ID number</strong><code>{revealed[request.request_id]}</code><button type="button" onClick={() => setRevealed((current) => ({ ...current, [request.request_id]: null }))}>Hide</button></> : <button type="button" onClick={() => void revealIdentity(request)} disabled={busyId === request.request_id}>{busyId === request.request_id ? "Loading..." : "Reveal ID number"}</button>}</div>
        <div className="admin-document-review">
          {documents[request.request_id] ? <>
            <figure><Image src={documents[request.request_id].frontUrl} alt="Front of government ID" width={1200} height={800} unoptimized /><figcaption>Front</figcaption></figure>
            <figure><Image src={documents[request.request_id].backUrl} alt="Back of government ID" width={1200} height={800} unoptimized /><figcaption>Back</figcaption></figure>
            <button type="button" onClick={() => setDocuments((current) => ({ ...current, [request.request_id]: null }))}>Hide photos</button>
          </> : <button type="button" onClick={() => void revealDocuments(request)} disabled={busyId === request.request_id}>{busyId === request.request_id ? "Loading..." : "View ID photos"}</button>}
        </div>
        <label className="admin-note-label">Review note<textarea value={notes[request.request_id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [request.request_id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Optional note to the applicant" /></label>
        <footer><button type="button" className="admin-primary-button" onClick={() => void reviewVerification(request, true)} disabled={busyId === request.request_id}><Check size={15} /> Approve</button><button type="button" className="admin-danger-button" onClick={() => void reviewVerification(request, false)} disabled={busyId === request.request_id}><X size={15} /> Decline</button></footer>
      </article>)}
      {!verifications.length && <p className="admin-empty">No verification applications are waiting.</p>}
    </section>}

    {tab === "posts" && <section className="admin-review-list">
      {posts.map((post) => <article className="admin-review-card admin-post-card surface" key={post.post_id}>
        <header><div><span className="eyebrow">POST BY {post.author_username ? `@${post.author_username}` : "MEMBER"}</span><h2>{post.author_name}</h2><p>{dateLabel(post.created_at)} · {post.visibility}{post.is_hidden ? " · Hidden by author" : ""}</p></div><span className={`admin-status ${post.is_flagged ? "open" : "active"}`}>{post.is_flagged ? "flagged" : "visible"}</span></header>
        {post.content && <p className="admin-post-content">{post.content}</p>}
        {post.mediaUrl && (post.media_type === "video"
          ? <VideoPlayer className="admin-post-media" src={post.mediaUrl} />
          : <div className="admin-post-media admin-post-image"><Image src={post.mediaUrl} alt="Post attachment" fill sizes="(max-width: 680px) 100vw, 680px" unoptimized /></div>)}
        <label className="admin-note-label">Flag note<textarea value={notes[post.post_id] ?? post.flag_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [post.post_id]: event.target.value }))} maxLength={1000} rows={2} /></label>
        <footer><button type="button" className={post.is_flagged ? "admin-manage-button" : "admin-primary-button"} onClick={() => void updatePostFlag(post, !post.is_flagged)} disabled={busyId === post.post_id}><Flag size={14} />{post.is_flagged ? "Clear flag" : "Flag post"}</button><button type="button" className="admin-danger-button" onClick={() => void deleteAdminPost(post)} disabled={busyId === post.post_id}><X size={14} />Delete post</button></footer>
      </article>)}
      {hasMorePosts && <button className="admin-manage-button admin-post-load-more" type="button" onClick={() => void loadMorePosts()} disabled={busyId === "posts-more"}>{busyId === "posts-more" ? "Loading..." : "Load more posts"}</button>}
      {!posts.length && <p className="admin-empty">No posts are available for moderation.</p>}
    </section>}

    {tab === "reports" && <section className="admin-review-list">
      {reports.map((report) => <article className="admin-review-card surface" key={report.report_id}>
        <header><div><span className="eyebrow">{report.category.replaceAll("_", " ")}</span><h2>{report.target_user_name || "Reported content"}</h2><p>Reported by {report.reporter_name} ({report.reporter_email}) · {dateLabel(report.created_at)}</p></div><span className={`admin-status ${report.status}`}>{report.status}</span></header>
        <p className="admin-report-details">{report.details || "No additional details provided."}</p>
        {report.target_post_content && <blockquote>{report.target_post_content}</blockquote>}{report.target_comment_content && <blockquote>{report.target_comment_content}</blockquote>}
        <label className="admin-note-label">Admin note<textarea value={notes[report.report_id] || report.admin_note || ""} onChange={(event) => setNotes((current) => ({ ...current, [report.report_id]: event.target.value }))} maxLength={1000} rows={2} /></label>
        <footer><button type="button" className="admin-manage-button" onClick={() => void updateReport(report, "reviewing")} disabled={busyId === report.report_id}>Mark reviewing</button><button type="button" className="admin-primary-button" onClick={() => void updateReport(report, "resolved")} disabled={busyId === report.report_id}><Check size={15} /> Resolve</button><button type="button" className="admin-danger-button" onClick={() => void updateReport(report, "dismissed")} disabled={busyId === report.report_id}><X size={15} /> Dismiss</button></footer>
      </article>)}
      {!reports.length && <p className="admin-empty">No reports have been submitted.</p>}
    </section>}

    {tab === "audit" && <section className="admin-audit-list">{audit.map((entry) => <div key={entry.id}><Clock3 size={15} /><span>{entry.action.replaceAll("_", " ")}</span><small>{entry.target_user_id || "System"} · {dateLabel(entry.created_at)}</small></div>)}{!audit.length && <p className="admin-empty">Admin actions will appear here.</p>}</section>}
    {notice && <div className="admin-notice" role="status"><ShieldAlert size={15} />{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")}><X size={14} /></button></div>}
  </div>;
}