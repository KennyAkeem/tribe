import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ExternalLink, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import PasswordResetForm from "./password-reset-form";
import ProfileEditor from "./profile-editor";

export const metadata = { title: "Dashboard — Tribe" };

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/login?next=%2Fdashboard");
  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    redirect("/login?error=verification");
  }

  let profileResult = await supabase
    .from("profiles")
    .select("full_name, username, bio, avatar_url, teach_skills, learn_skills, location")
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error?.message.includes("location")) {
    profileResult = await supabase
      .from("profiles")
      .select("full_name, username, bio, avatar_url, teach_skills, learn_skills")
      .eq("id", user.id)
      .maybeSingle();
  }
  const { data: profile } = profileResult;
  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "member";

  return (
    <main className="dashboard-page">
      <section className="dashboard-content">
        <span className="eyebrow">YOUR TRIBE, AT A GLANCE</span>
        <h1>Welcome in, {name}.</h1>
        <p className="dashboard-lede">Your email is verified and your account is ready. This is your home base on Tribe.</p>
        {params?.passwordReset === "1" && <PasswordResetForm />}
        <div className="dashboard-main-row">
          <div className="dashboard-welcome-panel">
            <span className="dashboard-icon"><Users size={20} /></span>
            <span className="eyebrow">A GOOD PLACE TO START</span>
            <h2>Your people are waiting.</h2>
            <p>Head to the feed to see what your community is sharing and add your voice to the conversation.</p>
            <Link className="dashboard-feed-link" href="/">Go to the feed <ArrowUpRight size={16} /></Link>
          </div>
          <div className="dashboard-account-panel">
            <span className="eyebrow">ACCOUNT</span>
            <dl>
              <div><dt>Name</dt><dd>{name}</dd></div>
              <div><dt>Username</dt><dd>{profile?.username ? `@${profile.username}` : "Not set yet"}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Email status</dt><dd><span className="verified-dot" /> Verified</dd></div>
            </dl>
          </div>
        </div>
        <ProfileEditor profile={{
          fullName: profile?.full_name || "",
          username: profile?.username || "",
          bio: profile?.bio || "",
          avatarUrl: profile?.avatar_url || "",
          teachSkills: Array.isArray(profile?.teach_skills) ? profile.teach_skills : [],
          learnSkills: Array.isArray(profile?.learn_skills) ? profile.learn_skills : [],
          location: profile?.location || "",
        }} />
        {profile?.username && <Link className="dashboard-public-profile" href={`/profile/${encodeURIComponent(profile.username)}`}><ExternalLink size={14} /> View your public profile</Link>}
      </section>
    </main>
  );
}