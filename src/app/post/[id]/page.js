import Link from "next/link";
import { notFound } from "next/navigation";
import FeedPost from "@/app/feed-post";
import { createClient } from "@/lib/supabase/server";
import { addSignedMediaUrls, fetchPostRows } from "@/lib/supabase/post-media";

export async function generateMetadata() {
  return { title: "Post — Tribe" };
}

function formatPostTime(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default async function PostPage({ params }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: { user } }, postResult] = await Promise.all([
    supabase.auth.getUser(),
    fetchPostRows(supabase, (query) => query.eq("id", id).limit(1)),
  ]);
  const row = postResult.data?.[0];
  if (postResult.error || !row) notFound();

  const [post] = await addSignedMediaUrls(supabase, [row]);
  const authorName = post.profiles?.full_name || "Tribe member";
  const viewPost = {
    id: post.id,
    profileId: post.author_id,
    name: authorName,
    handle: post.profiles?.username || "member",
    username: post.profiles?.username || "",
    isVerified: Boolean(post.profiles?.is_verified),
    avatarUrl: post.profiles?.avatar_url || "",
    time: formatPostTime(post.created_at),
    text: post.content,
    visibility: post.visibility,
    isHidden: Boolean(post.is_hidden),
    isRepost: Boolean(post.repost_of),
    repostedPost: post.reposted_post ? {
      id: post.reposted_post.id,
      profileId: post.reposted_post.author_id,
      name: post.reposted_post.profiles?.full_name || "Tribe member",
      username: post.reposted_post.profiles?.username || "",
      avatarUrl: post.reposted_post.profiles?.avatar_url || "",
      mediaUrl: post.reposted_post.mediaUrl,
      mediaType: post.reposted_post.media_type || (post.reposted_post.image_url ? "image" : ""),
      text: post.reposted_post.content,
    } : null,
    mediaPath: post.media_path,
    mediaUrl: post.mediaUrl,
    mediaType: post.media_type || (post.image_url ? "image" : ""),
    imageAlt: "Photo shared with this post",
    energyTotal: Number(post.energy_total || 0),
    comments: (post.comments || []).map((comment) => ({
      id: comment.id,
      authorId: comment.author_id,
      author: comment.profiles?.full_name || "A friend",
      username: comment.profiles?.username || "",
      avatarUrl: comment.profiles?.avatar_url || "",
      parentCommentId: comment.parent_comment_id,
      content: comment.content,
      time: formatPostTime(comment.created_at),
    })),
    supabaseBacked: true,
  };

  return (
    <main className="profile-page">
      <section className="profile-page-content">
        <Link className="contact-back" href="/">Back to Tribe</Link>
        <FeedPost post={viewPost} currentUserId={user?.id || null} readOnly />
      </section>
    </main>
  );
}