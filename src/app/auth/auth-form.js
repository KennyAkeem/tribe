"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isRegister = mode === "register";

  useEffect(() => {
    if (mode !== "login") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "verification") {
      setFeedback("That verification link is invalid or expired. Request a new signup email and try again.");
    }
  }, [mode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    const formData = new FormData(event.currentTarget);
    let supabase;
    try {
      supabase = createClient();
    } catch {
      setBusy(false);
      setFeedback("Connect a Supabase project by adding the URL and anon key to .env.local.");
      return;
    }

    try {
      if (mode === "forgot") {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", "/dashboard?passwordReset=1");
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(formData.get("email"), {
          redirectTo: callbackUrl.toString(),
        });
        setBusy(false);
        setFeedback(resetError ? resetError.message : "Check your email for a password reset link.");
        return;
      }

      const email = formData.get("email");
      const password = formData.get("password");
      if (isRegister) {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", "/login/success?verified=1&next=%2Fdashboard");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callbackUrl.toString(),
            data: { full_name: formData.get("name") },
          },
        });

        if (signUpError) {
          setFeedback(signUpError.message);
          return;
        }

        if (data.session) {
          await supabase.auth.signOut();
          setFeedback("Your Supabase project allowed sign-in before email verification. Enable Confirm email in Supabase Auth, then sign up again.");
          return;
        }

        window.sessionStorage.setItem("tribe_signup_email", email);
        router.replace("/register/confirm");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setFeedback(signInError.message);
        return;
      }

      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")
        ? requestedNext
        : "/dashboard";
      setBusy(false);
      router.replace(`/login/success?next=${encodeURIComponent(next)}`);
      router.refresh();
    } catch {
      setFeedback("We couldn’t complete that request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "forgot" ? "A fresh start." : isRegister ? "Find your people." : "Welcome back.";
  const subheading = mode === "forgot" ? "We’ll send you a link to reset your password." : isRegister ? "Make a little space for the people who matter." : "Your corner of the internet is right where you left it.";

  return (
    <main className="auth-page">
      <section className="auth-aside"><Link href="/" className="auth-brand"><span className="brand-mark"><span /><span /><span /></span>tribe<span className="brand-period">.</span></Link><div className="auth-aside-copy"><span className="eyebrow">CONNECTION, WITHOUT THE NOISE</span><h1>Good things<br />grow together.</h1><p>A little corner of the internet that feels like yours.</p></div><span className="auth-aside-note">A place to show up as yourself.</span></section>
      <section className="auth-main"><div className="auth-form-wrap"><Link href="/" className="auth-back"><ArrowLeft size={16} /> Back to Tribe</Link><span className="eyebrow">YOUR PEOPLE ARE HERE</span><h2>{heading}</h2><p className="auth-description">{subheading}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <label>Your name<input name="name" type="text" autoComplete="name" required placeholder="Jordan Lee" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          {mode !== "forgot" && <label>Password<div className="password-field"><input name="password" type={passwordVisible ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters" /><button className="password-visibility-toggle" type="button" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}><span key={passwordVisible ? "visible" : "hidden"} className="password-toggle-icon">{passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}</span></button></div></label>}
          {!isRegister && mode !== "forgot" && <Link href="/forgot-password" className="forgot-link">Forgot password?</Link>}
          {feedback && <p className="auth-message" role="status">{feedback}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : null}{mode === "forgot" ? "Send reset link" : isRegister ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Tribe?"} <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
      </div></section>
    </main>
  );
}