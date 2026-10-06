const repostFields = "repost_of";
const repostSourceFields = "id, content, image_url, media_path, media_type, visibility, energy_total, author_id, profiles!posts_author_id_fkey(id, full_name, username, avatar_url)";
const postFields = `id, content, image_url, media_path, media_type, visibility, is_hidden, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url, is_verified), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url)), ${repostFields}`;
const mediaPostFields = `id, content, image_url, media_path, media_type, visibility, is_hidden, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url)), ${repostFields}`;
const legacyPostFields = `id, content, image_url, visibility, is_hidden, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url)), repost_of`;
const originalPostFields = "id, content, image_url, media_path, media_type, visibility, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url, is_verified), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url))";
const originalMediaPostFields = "id, content, image_url, media_path, media_type, visibility, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url))";
const originalLegacyPostFields = "id, content, image_url, visibility, created_at, author_id, energy_total, profiles!posts_author_id_fkey(id, full_name, username, avatar_url), comments(id, author_id, parent_comment_id, content, created_at, profiles!comments_author_id_fkey(id, full_name, username, avatar_url))";

export async function fetchPostRows(supabase, buildQuery) {
  const shapes = [
    { fields: postFields, mediaSchemaAvailable: true, supportsReposts: true },
    { fields: mediaPostFields, mediaSchemaAvailable: true, supportsReposts: true },
    { fields: legacyPostFields, mediaSchemaAvailable: false, supportsReposts: true },
    { fields: originalPostFields, mediaSchemaAvailable: true, supportsReposts: false },
    { fields: originalMediaPostFields, mediaSchemaAvailable: true, supportsReposts: false },
    { fields: originalLegacyPostFields, mediaSchemaAvailable: false, supportsReposts: false },
  ];
  let result;
  for (const shape of shapes) {
    result = await buildQuery(supabase.from("posts").select(shape.fields));
    if (!result.error) {
      let data = result.data ?? [];
      if (shape.supportsReposts) {
        const sourceIds = [...new Set(data.map((post) => post.repost_of).filter(Boolean))];
        if (sourceIds.length) {
          const sourceResult = await supabase.from("posts").select(repostSourceFields).in("id", sourceIds);
          if (sourceResult.error) return { ...result, data: null, error: sourceResult.error, mediaSchemaAvailable: shape.mediaSchemaAvailable };
          const sourceById = new Map((sourceResult.data ?? []).map((post) => [post.id, post]));
          data = data.map((post) => ({ ...post, reposted_post: sourceById.get(post.repost_of) || null }));
        } else {
          data = data.map((post) => ({ ...post, reposted_post: null }));
        }
      }
      return { ...result, data, mediaSchemaAvailable: shape.mediaSchemaAvailable };
    }
    if (!/energy_total|is_hidden|media_path|media_type|is_verified|repost_of|posts_repost_of_fkey|relationship between/i.test(result.error.message)) return { ...result, mediaSchemaAvailable: false };
  }
  return { ...result, mediaSchemaAvailable: false };
}

export async function addSignedMediaUrls(supabase, posts) {
  const paths = [...new Set(posts.flatMap((post) => [post.media_path, post.reposted_post?.media_path]).filter(Boolean))];

  const { data } = paths.length
    ? await supabase.storage.from("post-media").createSignedUrls(paths, 3600)
    : { data: [] };
  const signedUrlByPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
  function mediaUrlFor(post) {
    return post?.media_path ? signedUrlByPath.get(post.media_path) || "" : post?.image_url || "";
  }
  return posts.map((post) => ({
    ...post,
    mediaUrl: mediaUrlFor(post),
    reposted_post: post.reposted_post ? { ...post.reposted_post, mediaUrl: mediaUrlFor(post.reposted_post) } : null,
  }));
}