"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ProfileBlockAction({ targetId, targetName }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function blockMember() {
    if (!window.confirm(`Block ${targetName}? They will no longer be able to find or contact you.`)) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await createClient().rpc("block_user", { p_blocked_id: targetId });
      if (error) {
        setErrorMessage(error.message.includes("block_user")
          ? "Apply the 202610060005_user_blocks.sql migration to enable blocking."
          : error.message);
        return;
      }
      router.replace("/friends?tab=blocked");
      router.refresh();
    } catch {
      setErrorMessage("Could not reach Tribe. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="profile-block-control">
    <button className="profile-block-button" type="button" onClick={() => void blockMember()} disabled={busy}>
      {busy ? <LoaderCircle size={14} className="spin" /> : <Ban size={14} />}
      {busy ? "Blocking..." : "Block"}
    </button>
    {errorMessage && <span className="profile-block-error" role="status">{errorMessage}</span>}
  </div>;
}
