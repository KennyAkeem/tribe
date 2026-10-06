"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function formatBalance(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function EnergyBalance() {
  const [userId, setUserId] = useState(null);
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let currentUserId = null;
    let channel;

    async function setCurrentUser(user) {
      const nextUserId = user?.id || null;
      if (!active || nextUserId === currentUserId) return;
      currentUserId = nextUserId;
      setUserId(nextUserId);
      setBalance(null);
      if (channel) void supabase.removeChannel(channel);
      if (!nextUserId) return;

      channel = supabase.channel(`energy:${nextUserId}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "energy_balances",
          filter: `user_id=eq.${nextUserId}`,
        }, (payload) => {
          if (active && currentUserId === nextUserId) setBalance(Number(payload.new.balance));
        })
        .subscribe();

      const { data, error } = await supabase.rpc("get_energy_balance");
      if (active && currentUserId === nextUserId && !error) setBalance(Number(data));
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void setCurrentUser(session?.user), 0);
    });

    void supabase.auth.getUser().then(({ data: { user } }) => {
      void setCurrentUser(user);
    });

    function handleBalance(event) {
      if (typeof event.detail === "number") setBalance(event.detail);
    }
    window.addEventListener("tribe:energy-balance", handleBalance);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("tribe:energy-balance", handleBalance);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  if (!userId) return null;

  const balanceLabel = balance === null ? "..." : formatBalance(balance);
  if (balance === 0) {
    return <Link className="energy-balance energy-recharge" href="/messages" title="Chat with someone to earn 10 energy" aria-live="polite">
      <Zap size={15} fill="currentColor" />
      <span>{balanceLabel}</span>
      <span className="energy-balance-label">Chat to recharge</span>
    </Link>;
  }
  return <div className="energy-balance" title={balance === null ? "Loading your energy" : `${balance.toLocaleString()} energy available. Earn 100 more each day, plus chat rewards.`} aria-live="polite">
    <Zap size={15} fill="currentColor" />
    <span>{balanceLabel}</span>
    <span className="energy-balance-label">Energy</span>
  </div>;
}
