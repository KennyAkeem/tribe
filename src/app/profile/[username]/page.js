import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MapPin, Settings, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addSignedMediaUrls, fetchPostRows } from "@/lib/supabase/post-media";
import ReferralInvite from "./referral-invite";
import ProfileBlockAction from "./profile-block-action";
import ProfileFriendAction from "./profile-friend-action";
import ProfileSections from "./profile-sections";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `${username === "me" ? "My profile" : `@${username}`} — Tribe` };
}

function formatPostTime(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default async function ProfilePage({ params }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (username === "me" && !user) redirect("/login?next=%2Fprofile%2Fme");

  function queryProfile(includeVerified, includeLocation) {
    const columns = [
      "id, full_name, username, bio, avatar_url, teach_skills, learn_skills",
      ...(includeVerified ? ["is_verified"] : []),
      ...(includeLocation ? ["location"] : []),
    ].join(", ");
    const query = supabase.from("profiles").select(columns);
    return username === "me"
      ? query.eq("id", user.id)
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username)
        ? query.eq("id", username)
        : query.eq("username", username);
  }
  let profileResult = await queryProfile(true, true).maybeSingle();
  if (profileResult.error?.message.includes("location")) profileResult = await queryProfile(true, false).maybeSingle();
  if (profileResult.error?.message.includes("is_verified")) profileResult = await queryProfile(false, false).maybeSingle();
  const { data: profile, error: profileError } = profileResult;
  if (profileError || !profile) notFound();

  let referralCode = null;
  let referralCount = 0;
  if (username === "me" && user) {
    const [{ data: referralProfile }, referralResult] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", profile.id).maybeSingle(),
      supabase.from("user_referrals").select("referred_user_id", { count: "exact", head: true }).eq("referrer_id", profile.id),
    ]);
    referralCode = referralProfile?.referral_code || null;
    referralCount = referralResult.count || 0;
  }

  const [postsResult, { data: viewerProfile }, verificationResult] = await Promise.all([
    fetchPostRows(supabase, (postsQuery) => postsQuery.eq("author_id", profile.id).order("created_at", { ascending: false })),
    user
      ? supabase.from("profiles").select("full_name, username, avatar_url").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    username === "me" && user
      ? supabase.rpc("my_verification_requests")
      : Promise.resolve({ data: [] }),
  ]);
  const visibleProfilePosts = (postsResult.data ?? []).filter((row) => !row.is_hidden || row.author_id === user?.id);
  const postsWithMedia = await addSignedMediaUrls(supabase, visibleProfilePosts);
  const posts = postsWithMedia.map((row) => {
    const original = row.reposted_post;
    return {
      id: row.id,
      profileId: row.author_id,
      name: row.profiles?.full_name || "Tribe member",
      handle: row.profiles?.username || "member",
      username: row.profiles?.username || "",
      isVerified: Boolean(row.profiles?.is_verified),
      avatarUrl: row.profiles?.avatar_url || "",
      time: formatPostTime(row.created_at),
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
  });

  const displayName = profile.full_name || profile.username || "Tribe member";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  const teachSkills = Array.isArray(profile.teach_skills) ? profile.teach_skills.filter(Boolean) : [];
  const learnSkills = Array.isArray(profile.learn_skills) ? profile.learn_skills.filter(Boolean) : [];
  const isOwnProfile = user?.id === profile.id;

  return (
    <main className="profile-page">
      <section className="profile-page-content">
        <header className="profile-summary surface">
          <span className="profile-avatar">{profile.avatar_url ? <Image src={profile.avatar_url} alt="" fill sizes="96px" unoptimized /> : initials}</span>
          <div className="profile-summary-copy"><span className="eyebrow">TRIBE PROFILE</span><h1>{displayName}{profile.is_verified && <BadgeCheck className="verified-badge" size={20} aria-label="Verified profile" />}</h1><p className="profile-username">{profile.username ? `@${profile.username}` : "Member"}</p>{profile.location && <p className="profile-location"><MapPin size={14} /><span>{profile.location}</span></p>}{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>
          {isOwnProfile && <div className="profile-summary-actions">
            <Link className="profile-edit-link" href="/dashboard">Edit profile</Link>
            <Link className="profile-edit-link" href="/settings"><Settings size={14} />Settings</Link>
            <Link className="profile-edit-link" href="/skill-swap"><Sparkles size={14} />Skill Swap</Link>
            {referralCode && <ReferralInvite code={referralCode} count={referralCount} />}
          </div>}
          {!isOwnProfile && <div className="profile-connection-actions">
            <ProfileFriendAction viewerId={user?.id || null} targetId={profile.id} username={profile.username} />
            {user && <ProfileBlockAction targetId={profile.id} targetName={displayName} />}
          </div>}
        </header>
        {(teachSkills.length || learnSkills.length) && (
          <section className="profile-skill-section surface">
            {teachSkills.length > 0 && (
              <div className="profile-skills-block">
                <span className="skill-label">Can teach</span>
                <div className="skill-pills">
                  {teachSkills.map((skill) => <span key={`teach-${skill}`} className="skill-pill teach">{skill}</span>)}
                </div>
              </div>
            )}
            {learnSkills.length > 0 && (
              <div className="profile-skills-block">
                <span className="skill-label">Wants to learn</span>
                <div className="skill-pills">
                  {learnSkills.map((skill) => <span key={`learn-${skill}`} className="skill-pill learn">{skill}</span>)}
                </div>
              </div>
            )}
          </section>
        )}
        <ProfileSections posts={posts} viewerId={user?.id || null} currentProfile={viewerProfile} isOwnProfile={isOwnProfile} isVerified={profile.is_verified} initialVerificationRequests={verificationResult.data || []} targetProfile={{ id: profile.id }} />
      </section>
    </main>
  );
}