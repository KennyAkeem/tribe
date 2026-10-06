"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, House, LogIn, LogOut, MessageCircle, Settings, ShieldCheck, Sparkles, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import EnergyBalance from "@/components/energy-balance";
import NotificationCenter from "@/app/notifications/notification-center";
import PushNotificationPrompt from "@/components/push-notification-prompt";

const destinations = [
  { href: "/", label: "Home", Icon: House },
  { href: "/friends", label: "Friends", Icon: Users },
  { href: "/messages", label: "Messages", Icon: MessageCircle },
  { href: "/skill-swap", label: "Skill Swap", Icon: Sparkles },
  { href: "/videos", label: "Videos", Icon: Clapperboard },
  { href: "/profile/me", label: "My profile", Icon: UserRound },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export default function SiteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    async function updateUser(currentUser) {
      if (!mounted) return;
      setUser(currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.rpc("is_admin");
      if (mounted) setIsAdmin(Boolean(data));
    }
    void supabase.auth.getUser().then(({ data: { user: currentUser } }) => updateUser(currentUser));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentUser) => { void updateUser(currentUser); });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname === "/forgot-password" || pathname.startsWith("/auth/")) return null;

  async function signOut() {
    setSigningOut(true);
    const { error } = await createClient().auth.signOut();
    setSigningOut(false);
    if (error) return;
    router.replace("/login");
    router.refresh();
  }

  function isActive(href) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return <>
    <header className="global-navigation">
      <Link href="/" className="brand" aria-label="Tribe home"><span className="brand-mark"><span /><span /><span /></span><span>tribe<span className="brand-period">.</span></span></Link>
      <nav className="global-navigation-links" aria-label="Main navigation">
        {destinations.map(({ href, label, Icon }) => <Link key={href} href={href} className={isActive(href) ? "global-navigation-link active" : "global-navigation-link"} aria-current={isActive(href) ? "page" : undefined}><Icon size={17} /><span>{label}</span></Link>)}
        {isAdmin && <Link href="/admin" className={pathname.startsWith("/admin") ? "global-navigation-link active" : "global-navigation-link"}><ShieldCheck size={17} /><span>Admin</span></Link>}
      </nav>
      <div className="global-navigation-actions">
        {user && <EnergyBalance />}
        <NotificationCenter />
        {user && <PushNotificationPrompt userId={user.id} />}
        {user ? <>
          <button className="global-signout" type="button" onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /><span>{signingOut ? "Signing out" : "Sign out"}</span></button>
        </> : <Link href="/login" className="global-signin"><LogIn size={16} /><span>Sign in</span></Link>}
      </div>
    </header>
    <nav className="global-mobile-navigation" aria-label="Main navigation">
      {destinations.map(({ href, label, Icon }) => <Link key={href} href={href} className={isActive(href) ? "global-mobile-link active" : "global-mobile-link"} aria-label={label} title={label} aria-current={isActive(href) ? "page" : undefined}><Icon size={20} /></Link>)}
      {isAdmin && <Link href="/admin" className={pathname.startsWith("/admin") ? "global-mobile-link active" : "global-mobile-link"} aria-label="Admin" title="Admin"><ShieldCheck size={20} /></Link>}
    </nav>
  </>;
}