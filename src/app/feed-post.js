"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Check, Expand, Eye, EyeOff, Link2, MessageCircle, MoreHorizontal, Repeat2, Send, Share2, Trash2, Zap } from "lucide-react";
import VideoPlayer from "@/components/video-player";
import MediaViewer from "@/components/media-viewer";

function initials(name = "Member") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function Avatar({ name, imageUrl = "", size = "" }) {
  return <span className={`avatar avatar-coral ${size}`}>{imageUrl ? <Image src={imageUrl} alt="" fill sizes="39px" unoptimized /> : initials(name)}</span>;
}

function profileHref(username, profileId) {
  const identifier = username || profileId;
  return identifier ? `/profile/${encodeURIComponent(identifier)}` : null;
}

export default function FeedPost({ post, onSendEnergy, onComment, currentProfile, currentUserId, onRepost, isOwner = false, onHidePost, onDeletePost }) {
  const [sendingEnergy, setSendingEnergy] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [previewMedia, setPreviewMedia] = useState(null);
  const comments = post.comments || [];
  const topLevelComments = comments.filter((comment) => !comment.parentCommentId);
  const repliesFor = (commentId) => comments.filter((comment) => comment.parentCommentId === commentId);

  async function submitComment(event, content, parentCommentId = null) {
    event.preventDefault();
    if (!content.trim()) return;
    const sent = await onComment(post.id, content.trim(), parentCommentId);
    if (!sent) return;
    if (parentCommentId) {
      setReplyDraft("");
      setReplyingTo(null);
    } else {
      setCommentDraft("");
    }
  }

  async function sendEnergy() {
    if (!onSendEnergy || sendingEnergy || post.profileId === currentUserId) return;
    setSendingEnergy(true);
    try {
      await onSendEnergy(post.id);
    } finally {
      setSendingEnergy(false);
    }
  }

  function renderComment(comment, rootId = comment.id) {
    const personHref = profileHref(comment.username, comment.authorId);
    return <div className="comment-entry" key={comment.id}>
      <Avatar name={comment.author} imageUrl={comment.avatarUrl} size="avatar-tiny" />
      <div className="comment-entry-content">
        <p className="comment-bubble">{personHref ? <a href={personHref}>{comment.author}</a> : <strong>{comment.author}</strong>} {comment.content}</p>
        <div className="comment-entry-actions"><time>{comment.time || "Just now"}</time><button type="button" onClick={() => setReplyingTo(rootId)}>Reply</button></div>
      </div>
    </div>;
  }

  const authorHref = profileHref(post.username, post.profileId);
  const sourcePost = post.repostedPost || post;
  const sourceHref = profileHref(sourcePost.username, sourcePost.profileId);
  const sourceUrl = () => new URL(`${sourceHref || "/"}#post-${sourcePost.id}`, window.location.origin).toString();
  const canManage = isOwner && onHidePost && onDeletePost;
  const author = <>{authorHref ? <a href={authorHref}>{post.name}</a> : <strong>{post.name}</strong>}{post.isVerified && <BadgeCheck className="verified-badge" size={13} aria-label="Verified profile" />}</>;

  async function copyPostLink() {
    try {
      await navigator.clipboard.writeText(sourceUrl());
      setShareFeedback("Post link copied");
    } catch {
      setShareFeedback("Clipboard access is unavailable in this browser");
    }
  }

  async function shareWithDevice() {
    if (!navigator.share) {
      await copyPostLink();
      return;
    }
    try {
      await navigator.share({ title: `Post by ${sourcePost.name}`, text: sourcePost.text || "Shared from Tribe", url: sourceUrl() });
      setShareFeedback("Shared");
    } catch (error) {
      if (error.name !== "AbortError") setShareFeedback("Could not open the share sheet");
    }
  }

  function shareToWhatsApp() {
    const text = [sourcePost.text, sourceUrl()].filter(Boolean).join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setShareFeedback("Opening WhatsApp");
  }

  const energyGlow = post.energyTotal >= 100 ? "post-energy-glow-strong" : post.energyTotal >= 25 ? "post-energy-glow-medium" : post.energyTotal > 0 ? "post-energy-glow-soft" : "";

  return (
    <article className={`post surface ${energyGlow}`} id={`post-${post.id}`}>
      <header className="post-header">
        {authorHref ? <a className="post-avatar-link" href={authorHref}><Avatar name={post.name} imageUrl={post.avatarUrl} /></a> : <Avatar name={post.name} imageUrl={post.avatarUrl} />}
        <div className="post-author">
          {author}
          <span>@{post.handle} <span className="dot">·</span> {post.time}{post.visibility === "friends" && <span className="post-privacy"> · Friends only</span>}</span>
        </div>
        {canManage ? <div className="post-menu-wrap">
          <button className="icon-button post-more" type="button" aria-label="Post options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={20} /></button>
          {menuOpen && <div className="post-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void onHidePost(post.id, !post.isHidden); }}>{post.isHidden ? <Eye size={15} /> : <EyeOff size={15} />}{post.isHidden ? "Show to others" : "Hide from others"}</button>
            <button type="button" role="menuitem" className="post-menu-delete" onClick={() => { setMenuOpen(false); void onDeletePost(post.id); }}><Trash2 size={15} />Delete post</button>
          </div>}
        </div> : <button className="icon-button post-more" type="button" aria-label="More post options"><MoreHorizontal size={20} /></button>}
      </header>
      {post.isRepost && <p className="post-repost-note"><Repeat2 size={13} /> Reposted by {post.name}</p>}
      {post.isHidden && isOwner && <p className="post-hidden-note"><EyeOff size={13} /> Hidden from everyone else</p>}
      {post.text && <p className="post-copy">{post.text}</p>}
      {post.repostedPost && <section className="reposted-post">
        <header><Avatar name={post.repostedPost.name} imageUrl={post.repostedPost.avatarUrl || ""} size="avatar-small" /><div><a href={sourceHref || undefined}>{post.repostedPost.name}</a><span>Original post</span></div></header>
        {post.repostedPost.text && <p>{post.repostedPost.text}</p>}
        {post.repostedPost.mediaUrl && post.repostedPost.mediaType === "video" && <div className="post-video-wrap"><VideoPlayer className="post-video" src={post.repostedPost.mediaUrl} /><button className="post-media-expand" type="button" onClick={() => setPreviewMedia({ src: post.repostedPost.mediaUrl, type: "video" })} aria-label="Expand video"><Expand size={16} /></button></div>}
        {post.repostedPost.mediaUrl && post.repostedPost.mediaType !== "video" && <div className="post-image-wrap"><button className="post-image-preview" type="button" onClick={() => setPreviewMedia({ src: post.repostedPost.mediaUrl, type: "image" })} aria-label="Preview photo"><Image className="post-image" src={post.repostedPost.mediaUrl} alt="Photo from original post" fill sizes="(max-width: 680px) 100vw, 638px" unoptimized /><span><Expand size={16} /></span></button></div>}
      </section>}
      {!post.repostedPost && post.mediaUrl && post.mediaType === "video" ? <div className="post-video-wrap"><VideoPlayer className="post-video" src={post.mediaUrl} /><button className="post-media-expand" type="button" onClick={() => setPreviewMedia({ src: post.mediaUrl, type: "video" })} aria-label="Expand video"><Expand size={16} /></button></div> : null}
      {!post.repostedPost && post.mediaUrl && post.mediaType !== "video" ? <div className="post-image-wrap"><button className="post-image-preview" type="button" onClick={() => setPreviewMedia({ src: post.mediaUrl, type: "image" })} aria-label="Preview photo"><Image className="post-image" src={post.mediaUrl} alt={post.imageAlt || "Photo shared with this post"} fill sizes="(max-width: 680px) 100vw, 638px" unoptimized /><span><Expand size={16} /></span></button></div> : null}
      <div className="post-stats"><span><Zap className="energy-mark" size={13} fill="currentColor" /> {post.energyTotal || 0} energy</span><span>{comments.length} comments</span></div>
      <div className="post-actions">
        <button className="post-action energy-action" type="button" disabled={sendingEnergy || post.profileId === currentUserId} onClick={() => void sendEnergy()}><Zap size={18} /> <span>{post.profileId === currentUserId ? "Your post" : sendingEnergy ? "Sending..." : "Send energy"}</span></button>
        <button className="post-action" type="button" onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}><MessageCircle size={18} /><span>Comment</span></button>
        <div className="post-share-wrap">
          <button className="post-action share-action" type="button" aria-expanded={shareOpen} onClick={() => { setShareOpen((open) => !open); setShareFeedback(""); }}><Share2 size={17} /><span>Share</span></button>
          {shareOpen && <div className="post-share-menu" role="menu" aria-label="Share post">
            {onRepost && sourcePost.profileId !== currentUserId && post.profileId !== currentUserId && <button type="button" role="menuitem" onClick={() => { setShareOpen(false); void onRepost(sourcePost.id); }}><Repeat2 size={15} />Repost</button>}
            <button type="button" role="menuitem" onClick={() => void shareWithDevice()}><Share2 size={15} />More sharing options</button>
            <button type="button" role="menuitem" onClick={shareToWhatsApp}><Send size={15} />WhatsApp</button>
            <button type="button" role="menuitem" onClick={() => void copyPostLink()}><Link2 size={15} />Copy post link</button>
            {shareFeedback && <span className="post-share-feedback"><Check size={13} />{shareFeedback}</span>}
          </div>}
        </div>
      </div>
      {topLevelComments.length > 0 && <div className="comment-list">
        {topLevelComments.map((comment) => <div className="comment-thread" key={comment.id}>
          {renderComment(comment)}
          {repliesFor(comment.id).map((reply) => renderComment(reply, comment.id))}
          {replyingTo === comment.id && <form className="thread-reply-form" onSubmit={(event) => void submitComment(event, replyDraft, comment.id)}>
            <input autoFocus value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} aria-label={`Reply to ${comment.author}`} placeholder={`Reply to ${comment.author}...`} maxLength={2000} />
            <button type="submit" aria-label="Send reply" disabled={!replyDraft.trim()}><Send size={14} /></button>
            <button type="button" aria-label="Cancel reply" onClick={() => { setReplyingTo(null); setReplyDraft(""); }}>Cancel</button>
          </form>}
        </div>)}
      </div>}
      <form className="quick-reply" onSubmit={(event) => void submitComment(event, commentDraft)}>
        <Avatar name={currentProfile?.full_name || "You"} imageUrl={currentProfile?.avatar_url || ""} size="avatar-small" />
        <input id={`comment-${post.id}`} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Write a thoughtful comment..." aria-label="Write a comment" maxLength={2000} />
        <button type="submit" aria-label="Send comment" disabled={!commentDraft.trim()}><Send size={16} /></button>
      </form>
      {previewMedia && <MediaViewer src={previewMedia.src} type={previewMedia.type} onClose={() => setPreviewMedia(null)} />}
    </article>
  );
}