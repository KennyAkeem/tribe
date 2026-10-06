"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addSignedMediaUrls, fetchPostRows } from "@/lib/supabase/post-media";
import { describeModerationRestriction } from "@/lib/moderation";
import VideoPlayer from "@/components/video-player";
import FeedPost from "./feed-post";
import {
  Bell, Check, ChevronDown, Compass, Feather,
  Home as HomeIcon, ImagePlus, LogOut, MessageCircle, MoreHorizontal, Plus, Search, UserRound,
  Send, Settings, Sparkles, Users, X,
} from "lucide-react";

const mediaMimeTypesByExtension = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function getMediaMimeType(file) {
  const mimeType = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (Object.values(mediaMimeTypesByExtension).includes(mimeType)) return mimeType;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return mediaMimeTypesByExtension[extension] || "";
}

const mediaExtensionsByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

          function formatPostTime(value) {
            const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
            if (minutes < 60) return `${minutes} min ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours} hr ago`;
            return `${Math.floor(hours / 24)} d ago`;
          }

          function Avatar({ initials, tone = "avatar-coral", size = "", imageUrl = "" }) {
            return <span className={`avatar ${tone} ${size}`}>{imageUrl ? <Image src={imageUrl} alt="" fill sizes="39px" unoptimized /> : initials}</span>;
          }

          function SidebarLink({ icon: Icon, label, active = false, badge }) {
            return (
              <button className={`side-link ${active ? "active" : ""}`} type="button">
                <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                <span>{label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </button>
            );
          }

          export default function Home() {
            const [posts, setPosts] = useState([]);
            const [suggestions, setSuggestions] = useState([]);
            const [suggestionBusyId, setSuggestionBusyId] = useState("");
            const [draft, setDraft] = useState("");
            const [mediaFile, setMediaFile] = useState(null);
            const [mediaPreview, setMediaPreview] = useState("");
            const [mediaError, setMediaError] = useState("");
            const [posting, setPosting] = useState(false);
            const [mediaSchemaAvailable, setMediaSchemaAvailable] = useState(null);
            const [activeTab, setActiveTab] = useState("For you");
            const [feedReloadToken, setFeedReloadToken] = useState(0);
            const [audience, setAudience] = useState("public");
            const [friendCount, setFriendCount] = useState(0);
            const [notice, setNotice] = useState("");
            const [currentUser, setCurrentUser] = useState(null);
            const [currentProfile, setCurrentProfile] = useState(null);
            const displayName = currentProfile?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "Guest";

            useEffect(() => {
              if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
              const supabase = createClient();
              let active = true;

              async function loadFeed(user, friendIds = []) {
                if (activeTab === "Following" && !user) {
                  setPosts([]);
                  return;
                }

                const { data, error, mediaSchemaAvailable } = await fetchPostRows(supabase, (postsQuery) => {
                  if (activeTab === "Following") {
                    const authorIds = [...new Set([user.id, ...friendIds])];
                    postsQuery = postsQuery.in("author_id", authorIds).in("visibility", ["public", "friends"]);
                  } else {
                    postsQuery = postsQuery.eq("visibility", "public");
                  }
                  return postsQuery.order("created_at", { ascending: false }).limit(30);
                });

                if (!active) return;
                if (error) {
                  setNotice(describeModerationRestriction("posting", error));
                  return;
                }
                setMediaSchemaAvailable(mediaSchemaAvailable);

                const visiblePosts = (data ?? []).filter((row) => !row.is_hidden || row.author_id === user?.id);
                const postsWithMedia = await addSignedMediaUrls(supabase, visiblePosts);
                if (!active) return;
                setPosts(postsWithMedia.map((row) => {
                  const name = row.profiles?.full_name || "Tribe member";
                  const original = row.reposted_post;
                  return {
                    id: row.id,
                    profileId: row.author_id,
                    name,
                    handle: row.profiles?.username || "member",
                    username: row.profiles?.username || "",
                    isVerified: Boolean(row.profiles?.is_verified),
                    avatarUrl: row.profiles?.avatar_url || "",
                    time: formatPostTime(row.created_at),
                    avatar: name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(),
                    color: row.author_id === user?.id ? "me" : "coral",
                    text: row.content,
                    visibility: row.visibility,
                    isHidden: Boolean(row.is_hidden),
                    isRepost: Boolean(row.repost_of),
                    repostedPost: original ? {
                      id: original.id,
                      profileId: original.author_id,
                      name: original.profiles?.full_name || "Tribe member",
                      username: original.profiles?.username || "",
                      avatarUrl: original.profiles?.avatar_url || "",
                      mediaUrl: original.mediaUrl,
                      mediaType: original.media_type || (original.image_url ? "image" : ""),
                      text: original.content,
                    } : null,
                    mediaPath: row.media_path,
                    mediaUrl: row.mediaUrl,
                    mediaType: row.media_type || (row.image_url ? "image" : ""),
                    imageAlt: "Photo shared with this post",
                    energyTotal: Number(row.energy_total || 0),
                    comments: (row.comments ?? []).map((comment) => ({
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
                }));
              }

              async function initializeFeed() {
                const { data: { user } } = await supabase.auth.getUser();
                if (!active) return;
                setCurrentUser(user);
                let friendIds = [];
                if (user) {
                  const { data: profile } = await supabase.from("profiles")
                    .select("full_name, username, avatar_url")
                    .eq("id", user.id)
                    .maybeSingle();
                  if (!active) return;
                  setCurrentProfile(profile);
                  const { data: connections, error: connectionsError } = await supabase.from("friends")
                    .select("user_one, user_two")
                    .or(`user_one.eq.${user.id},user_two.eq.${user.id}`);
                  if (!active) return;
                  if (connectionsError) {
                    setNotice(`Could not load your connections: ${connectionsError.message}`);
                  } else {
                    friendIds = (connections ?? []).map((connection) => connection.user_one === user.id ? connection.user_two : connection.user_one);
                    setFriendCount(friendIds.length);
                  }
                  const { data: suggestedProfiles, error: suggestionsError } = await supabase.rpc("get_friend_suggestions", { p_limit: 4 });
                  if (!active) return;
                  if (suggestionsError) {
                    setSuggestions([]);
                    setNotice(`Could not load member suggestions: ${suggestionsError.message}`);
                  } else {
                    setSuggestions((suggestedProfiles ?? []).map((profile) => ({
                      id: profile.id,
                      name: profile.full_name || profile.username || "Tribe member",
                      username: profile.username || "",
                      avatarUrl: profile.avatar_url || "",
                    })));
                  }
                } else {
                  setCurrentProfile(null);
                  setFriendCount(0);
                  setSuggestions([]);
                }
                await loadFeed(user, friendIds);
              }

              const channel = supabase.channel("tribe-feed")
                .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, initializeFeed)
                .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, initializeFeed)
                .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, initializeFeed)
                .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, initializeFeed)
                .subscribe();

              void initializeFeed();
              return () => {
                active = false;
                void supabase.removeChannel(channel);
              };
            }, [activeTab, feedReloadToken]);

            useEffect(() => {
              if (!mediaPreview) return undefined;
              return () => URL.revokeObjectURL(mediaPreview);
            }, [mediaPreview]);

            async function sendFriendRequest(person) {
              if (!currentUser) {
                window.location.assign("/login?next=%2Ffriends");
                return;
              }
              setSuggestionBusyId(person.id);
              try {
                const { error } = await createClient().rpc("send_friend_request", { p_receiver_id: person.id });
                if (error) {
                  setNotice(describeModerationRestriction("friend_requests", error));
                  return;
                }
                setSuggestions((current) => current.filter((suggestion) => suggestion.id !== person.id));
                setNotice(`Friend request sent to ${person.name}.`);
              } catch {
                setNotice("Could not send the friend request. Check your connection and try again.");
              } finally {
                setSuggestionBusyId("");
              }
            }

            function handleAccountAction() {
              if (!currentUser) {
                window.location.assign("/login");
                return;
              }
              void createClient().auth.signOut().then(({ error }) => {
                if (error) setNotice(error.message);
                else window.location.assign("/");
              });
            }

            function choosePostMedia(event) {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (!getMediaMimeType(file)) {
                setMediaError("Choose a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file.");
                return;
              }
              if (file.size > 50 * 1024 * 1024) {
                setMediaError("Photos and videos must be 50 MB or smaller.");
                return;
              }
              setMediaError("");
              setMediaPreview(URL.createObjectURL(file));
              setMediaFile(file);
            }

            async function createPost(event) {
              event.preventDefault();
              if (!draft.trim() && !mediaFile) return;
              if (!currentUser) {
                setNotice("Sign in to share a post");
                return;
              }
              if (mediaFile && !mediaSchemaAvailable) {
                setNotice("Apply the 202610020007_post_media_and_replies.sql migration before attaching media.");
                return;
              }
              setPosting(true);
              const supabase = createClient();
              let mediaPath = null;
              try {
                if (mediaFile) {
                  const mimeType = getMediaMimeType(mediaFile);
                  const extension = mediaExtensionsByMimeType[mimeType];
                  mediaPath = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
                  const { error: uploadError } = await supabase.storage.from("post-media").upload(mediaPath, mediaFile, {
                    cacheControl: "3600",
                    contentType: mimeType,
                    upsert: false,
                  });
                  if (uploadError) throw uploadError;
                }
                const postRecord = {
                  author_id: currentUser.id,
                  content: draft.trim(),
                  visibility: audience,
                };
                if (mediaSchemaAvailable) {
                  postRecord.media_path = mediaPath;
                  postRecord.media_type = mediaFile ? (getMediaMimeType(mediaFile).startsWith("video/") ? "video" : "image") : null;
                }
                const { error: postError } = await supabase.from("posts").insert(postRecord);
                if (postError) throw postError;
                setDraft("");
                setMediaFile(null);
                setMediaPreview("");
                setNotice("Your post is live");
                window.setTimeout(() => setNotice(""), 2200);
              } catch (postError) {
                if (mediaPath) await supabase.storage.from("post-media").remove([mediaPath]);
                setNotice(describeModerationRestriction("posting", postError) || "Could not publish this post. Try again.");
              } finally {
                setPosting(false);
              }
            }

            async function sendEnergy(id) {
              const post = posts.find((item) => item.id === id);
              if (post?.supabaseBacked && !currentUser) {
                window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
                return;
              }
              if (!post?.supabaseBacked || !currentUser) {
                setNotice("Energy is available when connected to Tribe.");
                return;
              }
              try {
                const { data, error } = await createClient().rpc("send_post_energy", { p_post_id: id });
                if (error) {
                  setNotice(describeModerationRestriction("appreciating", error));
                  return;
                }
                setPosts((current) => current.map((item) => item.id === id ? { ...item, energyTotal: Number(data.post_energy) } : item));
                window.dispatchEvent(new CustomEvent("tribe:energy-balance", { detail: Number(data.balance) }));
                setNotice(`You sent 1 energy. ${Number(data.balance).toLocaleString()} remaining.`);
              } catch {
                setNotice("Could not reach Tribe. Check your connection and try again.");
              }
            }

            async function changePostVisibility(id, isHidden) {
              const post = posts.find((item) => item.id === id);
              if (!post || !currentUser) return;
              setPosts((current) => current.map((item) => item.id === id ? { ...item, isHidden } : item));
              const { error } = await createClient().from("posts").update({ is_hidden: isHidden }).eq("id", id).eq("author_id", currentUser.id);
              if (error) {
                setPosts((current) => current.map((item) => item.id === id ? { ...item, isHidden: post.isHidden } : item));
                setNotice(`Could not update post visibility: ${error.message}`);
              } else {
                setNotice(isHidden ? "Post hidden from everyone else." : "Post visible to others again.");
              }
            }

            async function deletePost(id) {
              const post = posts.find((item) => item.id === id);
              if (!post || !currentUser || !window.confirm("Delete this post permanently?")) return;
              const supabase = createClient();
              const { error } = await supabase.from("posts").delete().eq("id", id).eq("author_id", currentUser.id);
              if (error) {
                setNotice(`Could not delete post: ${error.message}`);
                return;
              }
              setPosts((current) => current.filter((item) => item.id !== id));
              if (post.mediaPath) await supabase.storage.from("post-media").remove([post.mediaPath]);
              setNotice("Post deleted.");
            }

            async function repostPost(id) {
              if (!currentUser) {
                setNotice("Sign in to repost posts");
                return;
              }
              const { error } = await createClient().rpc("repost_post", { p_post_id: id });
              if (error) {
                setNotice(describeModerationRestriction("posting", error));
                return;
              }
              setNotice("Reposted to your feed.");
              setFeedReloadToken((token) => token + 1);
            }

            async function addComment(id, comment, parentCommentId = null) {
              const post = posts.find((item) => item.id === id);
              if (post?.supabaseBacked) {
                if (!currentUser) {
                  setNotice("Sign in to comment");
                  return;
                }
                const supabase = createClient();
                const { data, error } = await supabase.from("comments").insert({ post_id: id, author_id: currentUser.id, content: comment, parent_comment_id: parentCommentId }).select("id, created_at").single();
                if (error) {
                  setNotice(describeModerationRestriction("commenting", error));
                  return false;
                }
                setPosts((current) => current.map((item) => item.id === id ? { ...item, comments: [...item.comments, {
                  id: data.id,
                  authorId: currentUser.id,
                  author: currentProfile?.full_name || currentUser.user_metadata?.full_name || "You",
                  username: currentProfile?.username || "",
                  avatarUrl: currentProfile?.avatar_url || "",
                  parentCommentId,
                  content: comment,
                  time: formatPostTime(data.created_at),
                }] } : item));
                return true;
              }
              setNotice("Sign in to comment on posts");
              return false;
            }

            return (
              <div className="app-shell">
                <div className="page-grid" id="feed">
                  <aside className="left-rail">
                    <div className="welcome-block"><span className="eyebrow">TUESDAY, SEPTEMBER 29</span><h1>Your people,<br />your place.</h1><p>A little corner of the internet that feels like yours.</p></div>
                    <nav className="primary-nav" aria-label="Main navigation">
                      <span className="nav-label">YOUR SPACE</span>
                      <SidebarLink icon={HomeIcon} label="Home feed" active />
                      <a className="side-link" href="/friends"><Users size={19} /><span>Friends</span></a>
                      <a className="side-link" href="/messages"><MessageCircle size={19} /><span>Messages</span></a>
                      <SidebarLink icon={Bell} label="Notifications" />
                      <SidebarLink icon={Compass} label="Explore" />
                    </nav>
                    <div className="sidebar-bottom">
                      <div className="sidebar-card"><div className="sidebar-card-icon"><Sparkles size={16} /></div><strong>Make it yours</strong><p>Add a photo and a few words to your profile.</p><a href="/dashboard">Edit profile <span>→</span></a></div>
                      <Link className="side-link settings-link" href="/settings"><Settings size={18} /><span>Settings</span></Link>
                      {currentUser ? <button className="side-link settings-link" type="button" onClick={handleAccountAction}><LogOut size={18} /><span>Sign out</span></button> : <><a className="side-link settings-link" href="/login"><LogOut size={18} /><span>Sign in</span></a><a className="side-link settings-link" href="/register"><Plus size={18} /><span>Create account</span></a></>}
                      <div className="rail-footer">© 2026 Tribe <span>·</span> Made for belonging</div>
                    </div>
                  </aside>

                  <main className="feed-column">
                    <section className="composer surface">
                      <div className="composer-top"><Avatar initials={displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} tone="avatar-me" imageUrl={currentProfile?.avatar_url} /><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`What’s on your mind, ${displayName.split(" ")[0]}?`} aria-label="Write a post" rows="2" /></div>
                      {mediaFile && mediaPreview && <div className="composer-media-preview">
                        {getMediaMimeType(mediaFile).startsWith("video/") ? <VideoPlayer className="composer-video-preview" src={mediaPreview} /> : <Image src={mediaPreview} alt="Selected post attachment preview" width={112} height={80} unoptimized />}
                        <span>{mediaFile.name}</span><button type="button" aria-label="Remove attachment" onClick={() => { setMediaFile(null); setMediaPreview(""); setMediaError(""); }}><X size={15} /></button>
                      </div>}
                      {mediaError && <p className="composer-media-error" role="alert">{mediaError}</p>}
                      <form onSubmit={createPost} className="composer-bottom"><div className="composer-tools"><label className={`composer-tool composer-media-picker ${mediaSchemaAvailable === false ? "unavailable" : ""}`} title={mediaSchemaAvailable === false ? "Apply the post-media migration to enable attachments" : mediaSchemaAvailable ? "Attach a photo or video" : "Checking media support"}><ImagePlus size={17} /><span>Photo/video</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={choosePostMedia} aria-label="Attach a photo or video" disabled={mediaSchemaAvailable !== true || posting} /></label><button type="button" className="composer-tool mood-tool" onClick={() => setDraft((text) => `${text}${text ? " " : ""}Feeling grateful ✨`)}><Sparkles size={16} /><span>Feeling</span></button></div><label className="audience-select"><Users size={15} /><select aria-label="Post audience" value={audience} onChange={(event) => setAudience(event.target.value)} disabled={!currentUser}><option value="public">Everyone</option><option value="friends">Friends only</option></select><ChevronDown size={13} /></label><button className="share-button" type="submit" disabled={posting || (!draft.trim() && !mediaFile)}>{posting ? "Posting..." : <><Feather size={15} /> Share</>}</button></form>
                      {mediaSchemaAvailable === false && <p className="composer-media-hint">Apply the post-media migration to enable photo and video posts.</p>}
                    </section>

                    <div className="feed-heading"><div className="feed-tabs" role="tablist" aria-label="Feed filter">{["For you", "Following"].map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "selected" : ""} type="button" onClick={() => { if (tab === "Following" && !currentUser) { setNotice("Sign in to see posts from your friends"); return; } setActiveTab(tab); }}>{tab}{tab === "Following" ? <span className="tab-count">{friendCount}</span> : null}</button>)}</div><button className="filter-button" type="button" onClick={() => setNotice("Showing the latest posts first")}><span className="filter-dot" /> Latest <ChevronDown size={14} /></button></div>
                    <div className="posts-list">{posts.length ? posts.map((post) => <FeedPost key={post.id} post={post} onSendEnergy={sendEnergy} onComment={addComment} currentProfile={currentProfile} currentUserId={currentUser?.id} onRepost={repostPost} isOwner={post.profileId === currentUser?.id} onHidePost={changePostVisibility} onDeletePost={deletePost} />) : <div className="empty-feed surface"><Users size={24} /><h3>{activeTab === "Following" ? "No posts from your friends yet" : currentUser ? "Your feed is quiet" : "No posts yet"}</h3><p>{activeTab === "Following" ? "Friends-only posts from your accepted connections appear here." : currentUser ? "Share the first post or connect with people to get started." : "Sign in to see posts from the community."}</p></div>}</div>
                    <div className="end-of-feed"><span /> You’re all caught up <span /></div>
                  </main>

                  <aside className="right-rail">
                    <section className="right-section people-section">
                      <div className="right-heading">
                        <div><span className="eyebrow">GOOD PEOPLE</span><h2>Find your tribe</h2></div>
                        <a className="icon-button" href="/friends" aria-label="Discover people"><MoreHorizontal size={20} /></a>
                      </div>
                      {currentUser ? <>
                        <div className="suggestions">{suggestions.map((person) => <div className="suggestion" key={person.id}>
                          <Avatar initials={person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()} imageUrl={person.avatarUrl} />
                          <div className="suggestion-info"><strong>{person.name}</strong><span>{person.username ? `@${person.username}` : "Tribe member"}</span></div>
                          <button className="add-friend" type="button" aria-label={`Send a friend request to ${person.name}`} title="Add friend" disabled={suggestionBusyId === person.id} onClick={() => void sendFriendRequest(person)}><Plus size={17} /></button>
                        </div>)}</div>
                        {suggestions.length ? <a className="see-people" href="/friends">See all members <span>→</span></a> : <p className="suggestions-empty">No new members to suggest right now.</p>}
                      </> : <p className="suggestions-empty"><a href="/login?next=%2Ffriends">Sign in</a> to discover real Tribe members.</p>}
                    </section>
                    <section className="right-section community-card"><div className="community-art"><span className="sun-shape" /><span className="hill hill-one" /><span className="hill hill-two" /><span className="community-caption">A GOOD PLACE<br />TO BE YOURSELF.</span></div><div className="community-copy"><span className="eyebrow">A NOTE FROM US</span><h3>Better together.<br />Always.</h3><p>Tribe is built for real connection. Thanks for being part of it.</p><a href="#feed">Our community values <span>→</span></a></div></section>
                    <footer className="right-footer"><a href="#feed">About</a><a href="#feed">Privacy</a><a href="#feed">Guidelines</a><span>© Tribe 2026</span></footer>
                  </aside>
                </div>
                {notice ? <div className="toast" role="status"><Check size={16} />{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
              </div>
            );
          }
