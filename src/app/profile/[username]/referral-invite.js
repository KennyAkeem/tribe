"use client";

import { useState } from "react";
import { Check, Copy, Users } from "lucide-react";

export default function ReferralInvite({ code, count }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyInviteLink() {
    const inviteUrl = new URL(`/register?ref=${encodeURIComponent(code)}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setError("");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy invite link");
    }
  }

  return (
    <>
      <button className="profile-edit-link profile-referral-button" type="button" onClick={() => void copyInviteLink()}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Link copied" : "Invite friends"}
        <span><Users size={12} /> {count}</span>
      </button>
      {error && <span className="profile-referral-error" role="status">{error}</span>}
    </>
  );
}