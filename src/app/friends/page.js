import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FriendsClient from "./friends-client";

export const metadata = { title: "Friends — Tribe" };

export default async function FriendsPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/login?next=%2Ffriends");
  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    redirect("/login?error=verification");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return <FriendsClient currentUser={{
    id: user.id,
    name: profile?.full_name || user.user_metadata?.full_name || "Member",
    username: profile?.username || "",
    avatarUrl: profile?.avatar_url || "",
  }} initialTab={["requests", "friends", "blocked"].includes(params?.tab) ? params.tab : "discover"} />;
}
