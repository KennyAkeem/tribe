"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FeedPost from "@/app/feed-post";
import { createClient } from "@/lib/supabase/client";
import { describeModerationRestriction } from "@/lib/moderation";

export default function ProfileTimeline({ posts: initialPosts, viewerId, currentProfile }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [notice, setNotice] = useState("");

  async function sendEnergy(id) {
    if (!viewerId) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const post = posts.find((item) => item.id === id);
    if (!post) return;
    const { data, error } = await createClient().rpc("send_post_energy", { p_post_id: id });
    if (error) {
      setNotice(describeModerationRestriction("appreciating", error));
      return;
    }
    setPosts((current) => current.map((item) => item.id === id ? { ...item, energyTotal: Number(data.post_energy) } : item));
    window.dispatchEvent(new CustomEvent("tribe:energy-balance", { detail: Number(data.balance) }));
    setNotice(`You sent 1 energy. ${Number(data.balance).toLocaleString()} remaining.`);
  }

  async function addComment(id, content, parentCommentId = null) {
    if (!viewerId) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return false;
    }
    const supabase = createClient();
    const { data, error } = await supabase.from("comments")
      .insert({ post_id: id, author_id: viewerId, content, parent_comment_id: parentCommentId })
      .select("id, created_at")
      .single();
    if (error) {
      setNotice(describeModerationRestriction("commenting", error));
      return false;
    }
    setPosts((current) => current.map((post) => post.id === id ? { ...post, comments: [...post.comments, {
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

  return <>
    {posts.length ? <div className="posts-list">{posts.map((post) => <FeedPost key={post.id} post={post} onSendEnergy={sendEnergy} onComment={addComment} currentProfile={currentProfile} currentUserId={viewerId} />)}</div>
      : <div className="profile-empty surface"><p>No posts yet.</p></div>}
    {notice && <p className="profile-feedback" role="status">{notice}</p>}
  </>;
}