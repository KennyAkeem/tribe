import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Messenger from "./messenger";

export const metadata = { title: "Messages — Tribe" };

export default async function MessagesPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/login?next=%2Fmessages");
  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    redirect("/login?error=verification");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return <Messenger currentUser={{
    id: user.id,
    name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
    username: profile?.username || "",
    avatarUrl: profile?.avatar_url || "",
  }} initialConversationId={params?.conversation || null} />;
}