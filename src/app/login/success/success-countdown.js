"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

const confettiColors = ["#e7826e", "#e6bb82", "#5e9271", "#7798a4", "#d5a9a0", "#87a47d"];

export default function LoginSuccess({ destination, verified }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (remaining === 0) {
      router.replace(destination);
      return undefined;
    }
    const timer = window.setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [destination, remaining, router]);

  return (
    <main className="auth-page auth-status-page">
      <section className="auth-aside"><Link href="/" className="auth-brand"><span className="brand-mark"><span /><span /><span /></span>tribe<span className="brand-period">.</span></Link><div className="auth-aside-copy"><span className="eyebrow">CONNECTION, WITHOUT THE NOISE</span><h1>Good things<br />grow together.</h1><p>A little corner of the internet that feels like yours.</p></div><span className="auth-aside-note">A place to show up as yourself.</span></section>
      <section className="auth-main">
        <div className="auth-form-wrap auth-status-wrap">
          <div className="auth-confetti" aria-hidden="true">
            {Array.from({ length: 32 }, (_, index) => <span key={index} style={{ left: `${(index * 41) % 98 + 1}%`, animationDelay: `${index % 8 * 0.15}s`, backgroundColor: confettiColors[index % confettiColors.length] }} />)}
          </div>
          <span className="auth-success-mark"><Check size={23} strokeWidth={2.5} /></span>
          <span className="eyebrow">{verified ? "EMAIL CONFIRMED" : "SIGNED IN"}</span>
          <h2>{verified ? "You’re all set." : "Welcome back."}</h2>
          <p className="auth-description">{verified ? "Your email is confirmed and your Tribe account is ready." : "You’re signed in and ready to reconnect with your people."}</p>
          <div className="auth-countdown" aria-live="polite"><span className="auth-countdown-number" key={remaining}>{remaining}</span><span>Taking you there in {remaining} {remaining === 1 ? "second" : "seconds"}</span></div>
          <div className="auth-countdown-track" role="progressbar" aria-label="Redirect countdown" aria-valuemin="0" aria-valuemax="5" aria-valuenow={5 - remaining}><span style={{ width: `${(5 - remaining) * 20}%` }} /></div>
          <Link className="auth-status-action" href={destination}>Continue now</Link>
        </div>
      </section>
    </main>
  );
}