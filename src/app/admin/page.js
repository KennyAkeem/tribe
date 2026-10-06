import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addSignedMediaUrls } from "@/lib/supabase/post-media";
import AdminDashboard from "./admin-dashboard";

export const metadata = { title: "Admin console — Tribe" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=%2Fadmin");
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError || !isAdmin) redirect("/");

  const [usersResult, verificationsResult, reportsResult, postsResult, auditResult] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.rpc("admin_list_verification_requests"),
    supabase.rpc("admin_list_reports"),
    supabase.rpc("admin_list_posts", { p_offset: 0 }),
    supabase.from("admin_audit_log").select("id, action, target_user_id, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const postsWithMedia = await addSignedMediaUrls(supabase, postsResult.data || []);

  return <main className="admin-page"><AdminDashboard
    initialUsers={usersResult.data || []}
    initialVerifications={verificationsResult.data || []}
    initialReports={reportsResult.data || []}
    initialPosts={postsWithMedia}
    initialHasMorePosts={(postsResult.data || []).length === 100}
    initialAudit={auditResult.data || []}
    loadError={usersResult.error?.message || verificationsResult.error?.message || reportsResult.error?.message || postsResult.error?.message || auditResult.error?.message || ""}
  /></main>;
}