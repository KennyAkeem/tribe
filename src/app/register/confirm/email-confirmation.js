"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function EmailConfirmation() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setEmail(window.sessionStorage.getItem("tribe_signup_email") || "");
  }, []);

  async function resendEmail() {
    if (!email || busy) return;
    setBusy(true);
    setFeedback("");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", "/login/success?verified=1&next=%2Fdashboard");
    try {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl.toString() },
      });
      setFeedback(error ? error.message : "A fresh confirmation link is on its way.");
    } catch {
      setFeedback("We couldn’t resend the link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-status-page">
      <section className="auth-aside"><Link href="/" className="auth-brand"><span className="brand-mark"><span /><span /><span /></span>tribe<span className="brand-period">.</span></Link><div className="auth-aside-copy"><span className="eyebrow">ONE QUICK STEP</span><h1>Make it<br />official.</h1><p>Confirm your email and we’ll bring you right into your space.</p></div><span className="auth-aside-note">A place to show up as yourself.</span></section>
      <section className="auth-main">
        <div className="auth-form-wrap auth-confirm-wrap">
          <span className="auth-mail-mark"><Mail size={23} /></span>
          <span className="eyebrow">CHECK YOUR INBOX</span>
          <h2>Confirm your email.</h2>
          <p className="auth-description">We sent a verification link to <strong>{email || "your email address"}</strong>. Open it to confirm your address and sign in automatically.</p>
          {feedback && <p className="auth-message" role="status">{feedback}</p>}
          <button className="auth-status-action auth-resend-action" type="button" onClick={() => void resendEmail()} disabled={!email || busy}>{busy ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />}{busy ? "Sending link..." : "Resend confirmation email"}</button>
          <p className="auth-switch">Already confirmed? <Link href="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}