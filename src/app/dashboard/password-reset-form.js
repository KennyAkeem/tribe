"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setFeedback(error.message);
      return;
    }
    setFeedback("Password updated.");
    setPassword("");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className="password-reset-panel">
      <span className="eyebrow">PASSWORD RESET</span>
      <h2>Choose a new password.</h2>
      <form onSubmit={updatePassword}>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Update password</button>
        {feedback && <p className="auth-message" role="status">{feedback}</p>}
      </form>
    </section>
  );
}