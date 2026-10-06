import { createClient } from "@/lib/supabase/server";
import { addSignedMediaUrls } from "@/lib/supabase/post-media";
import VideoFeed from "./video-feed";

export const metadata = { title: "Videos — Tribe" };

function formatPostTime(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

async function loadVideos(supabase) {
  const fields = "id, content, media_path, media_type, visibility, is_hidden, created_at, author_id, profiles!posts_author_id_fkey(id, full_name, username)";
  const fallbackFields = "id, content, media_path, media_type, visibility, created_at, author_id, profiles!posts_author_id_fkey(id, full_name, username)";
  let rows = [];
  let offset = 0;
  const pageSize = 100;
  let selectedFields = fields;

  while (true) {
    let result = await supabase.from("posts").select(selectedFields)
      .eq("media_type", "video")
      .in("visibility", ["public", "friends"])
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error?.message.includes("is_hidden")) {
      selectedFields = fallbackFields;
      result = await supabase.from("posts").select(selectedFields)
        .eq("media_type", "video")
        .in("visibility", ["public", "friends"])
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
    }
    if (result.error || !result.data?.length) break;
    rows = rows.concat(result.data);
    if (result.data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export default async function VideosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const rows = await loadVideos(supabase);
  const visibleRows = rows.filter((row) => !row.is_hidden || row.author_id === user?.id);
  const postsWithMedia = await addSignedMediaUrls(supabase, visibleRows);
  const videos = postsWithMedia.filter((post) => post.mediaUrl).map((post) => ({
    id: post.id,
    profileId: post.author_id,
    username: post.profiles?.username || "",
    name: post.profiles?.full_name || post.profiles?.username || "Tribe member",
    text: post.content,
    mediaUrl: post.mediaUrl,
    createdAt: formatPostTime(post.created_at),
  }));

  return <VideoFeed videos={videos} />;
}