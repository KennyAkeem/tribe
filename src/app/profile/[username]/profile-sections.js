"use client";

import { useState } from "react";
import { BadgeCheck, Flag, LoaderCircle, ShieldCheck } from "lucide-react";
import { countryOptions } from "@/lib/countries";
import FeedPost from "@/app/feed-post";
import { createClient } from "@/lib/supabase/client";
import { describeModerationRestriction } from "@/lib/moderation";

const idTypes = [
  ["passport", "Passport"],
  ["national_id", "National identity card"],
  ["drivers_license", "Driver's license"],
  ["residence_permit", "Residence permit"],
  ["other", "Other government-issued ID"],
];

export default function ProfileSections({
  posts,
  viewerId,
  currentProfile,
  isOwnProfile,
  isVerified,
  initialVerificationRequests,
  targetProfile,
}) {
  const [timelinePosts, setTimelinePosts] = useState(posts);
  const [activeTab, setActiveTab] = useState("timeline");
  const [requests, setRequests] = useState(initialVerificationRequests);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function submitVerification(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/verification-requests", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your application.");
      setRequests((current) => [{ ...result.request, review_note: "" }, ...current]);
      formElement.reset();
      setNotice("Your verification request was submitted for review.");
    } catch (error) {
      setNotice(error.message || "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: targetProfile.id,
          category: form.get("category"),
          details: form.get("details"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit this report.");
      setReporting(false);
      setNotice("Your report was sent to the moderation team.");
    } catch (error) {
      setNotice(error.message || "Could not submit this report.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEnergy(id) {
    if (!viewerId) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const post = timelinePosts.find((item) => item.id === id);
    if (!post) return;
    try {
      const { data, error } = await createClient().rpc("send_post_energy", { p_post_id: id });
      if (error) {
        setNotice(describeModerationRestriction("appreciating", error));
        return;
      }
      setTimelinePosts((current) => current.map((item) => item.id === id ? { ...item, energyTotal: Number(data.post_energy) } : item));
      window.dispatchEvent(new CustomEvent("tribe:energy-balance", { detail: Number(data.balance) }));
      setNotice(`You sent 1 energy. ${Number(data.balance).toLocaleString()} remaining.`);
    } catch {
      setNotice("Could not reach Tribe. Check your connection and try again.");
    }
  }

  async function addComment(id, content, parentCommentId = null) {
    if (!viewerId) return false;
    const supabase = createClient();
    const { data, error } = await supabase.from("comments")
      .insert({ post_id: id, author_id: viewerId, content, parent_comment_id: parentCommentId })
      .select("id, created_at")
      .single();
    if (error) {
      setNotice(describeModerationRestriction("commenting", error));
      return false;
    }
    setTimelinePosts((current) => current.map((post) => post.id === id ? { ...post, comments: [...post.comments, {
      id: data.id,
      authorId: viewerId,
      author: currentProfile?.full_name || "You",
      username: currentProfile?.username || "",
      avatarUrl: currentProfile?.avatar_url || "",
      parentCommentId,
      content,
      time: "Just now",
    }] } : post));
    return true;
  }

  async function repostPost(id) {
    if (!viewerId) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const source = timelinePosts.find((post) => post.id === id);
    if (!source) return;
    const { data, error } = await createClient().rpc("repost_post", { p_post_id: id });
    if (error) {
      setNotice(describeModerationRestriction("posting", error));
      return;
    }
    const original = source.repostedPost || source;
    setTimelinePosts((current) => [{
      ...source,
      id: data,
      profileId: viewerId,
      name: currentProfile?.full_name || "You",
      handle: currentProfile?.username || "member",
      username: currentProfile?.username || "",
      isVerified: false,
      avatarUrl: currentProfile?.avatar_url || "",
      time: "Just now",
      text: "",
      visibility: "public",
      isHidden: false,
      isRepost: true,
      repostedPost: original,
      mediaPath: null,
      mediaUrl: "",
      mediaType: "",
      energyTotal: 0,
      comments: [],
    }, ...current]);
    setNotice("Reposted to your profile.");
  }

  async function changePostVisibility(id, isHidden) {
    if (!isOwnProfile || !viewerId) return;
    const post = timelinePosts.find((item) => item.id === id);
    if (!post) return;
    setTimelinePosts((current) => current.map((item) => item.id === id ? { ...item, isHidden } : item));
    const { error } = await createClient().from("posts").update({ is_hidden: isHidden }).eq("id", id).eq("author_id", viewerId);
    if (error) {
      setTimelinePosts((current) => current.map((item) => item.id === id ? { ...item, isHidden: post.isHidden } : item));
      setNotice(`Could not update post visibility: ${error.message}`);
    } else {
      setNotice(isHidden ? "Post hidden from everyone else." : "Post visible to others again.");
    }
  }

  async function deletePost(id) {
    if (!isOwnProfile || !viewerId) return;
    const post = timelinePosts.find((item) => item.id === id);
    if (!post || !window.confirm("Delete this post permanently?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("posts").delete().eq("id", id).eq("author_id", viewerId);
    if (error) {
      setNotice(`Could not delete post: ${error.message}`);
      return;
    }
    setTimelinePosts((current) => current.filter((item) => item.id !== id));
    if (post.mediaPath) await supabase.storage.from("post-media").remove([post.mediaPath]);
    setNotice("Post deleted.");
  }

  const pending = requests.find((request) => request.status === "pending");

  return <>
    <div className="profile-toolbar">
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        <button type="button" role="tab" aria-selected={activeTab === "timeline"} className={activeTab === "timeline" ? "selected" : ""} onClick={() => setActiveTab("timeline")}>Timeline</button>
        {isOwnProfile && <button type="button" role="tab" aria-selected={activeTab === "verification"} className={activeTab === "verification" ? "selected" : ""} onClick={() => setActiveTab("verification")}><BadgeCheck size={15} /> Get verified</button>}
      </div>
      {!isOwnProfile && viewerId && <button className="profile-report-trigger" type="button" onClick={() => setReporting((value) => !value)}><Flag size={14} /> Report</button>}
    </div>

    {activeTab === "timeline" && <>
      {reporting && <form className="profile-report-form surface" onSubmit={submitReport}>
        <label>Reason<select name="category" required><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="unsafe_content">Unsafe content</option><option value="other">Other</option></select></label>
        <label>Details<textarea name="details" maxLength={2000} rows={3} placeholder="Share the context that would help us review this report." /></label>
        <button className="profile-report-submit" type="submit" disabled={busy}>{busy ? "Sending..." : "Submit report"}</button>
      </form>}
      {timelinePosts.length ? <div className="posts-list">{timelinePosts.map((post) => <FeedPost key={post.id} post={post} onSendEnergy={sendEnergy} onComment={addComment} currentProfile={currentProfile} currentUserId={viewerId} onRepost={repostPost} isOwner={isOwnProfile && post.profileId === viewerId} onHidePost={changePostVisibility} onDeletePost={deletePost} />)}</div>
        : <div className="profile-empty surface"><p>No posts yet.</p></div>}
    </>}

    {activeTab === "verification" && <section className="verification-panel surface">
      <span className="verification-icon"><ShieldCheck size={20} /></span>
      <span className="eyebrow">TRIBE VERIFICATION</span>
      <h2>{isVerified ? "Your profile is verified." : "Request a verified badge."}</h2>
      <p className="verification-copy">Submit your contact details and clear photos of both sides of your government-issued ID for a manual review. Your ID number is encrypted, and only administrators can access your documents.</p>
      {isVerified && <p className="verification-result approved"><BadgeCheck size={16} /> Verified badge active</p>}
      {requests.map((request) => <p className={`verification-result ${request.status}`} key={request.request_id || request.id}>
        {request.status === "pending" ? "Application pending review" : request.status === "approved" ? "Application approved" : "Application declined"}
        {request.review_note ? `: ${request.review_note}` : ""}
      </p>)}
      {!isVerified && !pending && <form className="verification-form" onSubmit={submitVerification}>
        <label>Phone number<input name="phoneNumber" type="tel" autoComplete="tel" placeholder="+1 555 010 1234" minLength={5} maxLength={40} required /></label>
        <label>Country / location<select name="countryCode" defaultValue="" required><option value="" disabled>Select your country</option>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label>Government-issued ID type<select name="governmentIdType" defaultValue="passport" required>{idTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>ID number<input name="governmentId" type="password" autoComplete="off" minLength={3} maxLength={120} required /></label>
        <label>Front of ID<input name="idFront" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <label>Back of ID<input name="idBack" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button className="verification-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin" /> Submitting</> : "Submit for review"}</button>
      </form>}
      <p className="verification-privacy">Applications may take several days. Only verified administrators can review submitted details.</p>
    </section>}
    {notice && <p className="profile-feedback" role="status">{notice}</p>}
  </>;
}