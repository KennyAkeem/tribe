import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account access — Tribe" };

export default async function AccountStatusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: moderation } = await supabase.from("user_moderation")
    .select("status, reason, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const until = moderation?.expires_at ? new Date(moderation.expires_at).toLocaleString() : null;

  return <main className="account-status-page">
    <section className="account-status-panel surface">
      <span className="eyebrow">ACCOUNT ACCESS</span>
      <h1>{moderation?.status === "banned" ? "Your account is banned." : "Your account is suspended."}</h1>
      <p>{moderation?.reason || "Your account is currently unavailable. Contact Tribe support if you believe this is a mistake."}</p>
      {until && <p className="account-status-expiry">Access is scheduled to resume {until}.</p>}
      <form action={async () => {
        "use server";
        const auth = await createClient();
        await auth.auth.signOut();
        redirect("/login");
      }}><button className="global-signout" type="submit">Sign out</button></form>
    </section>
  </main>;
}