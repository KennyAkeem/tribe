"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function DashboardActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const { error } = await createClient().auth.signOut();
    setBusy(false);
    if (error) return;
    router.replace("/login");
    router.refresh();
  }

  return <button className="dashboard-signout" type="button" onClick={signOut} disabled={busy}><LogOut size={16} />{busy ? "Signing out..." : "Sign out"}</button>;
}