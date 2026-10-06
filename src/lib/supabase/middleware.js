import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function updateSession(request) {
  let response = NextResponse.next({ request });
  let refreshedCookies = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  if (user && !pathname.startsWith("/account-status")) {
    const { data: moderation } = await supabase.from("user_moderation")
      .select("status, reason, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    const notExpired = !moderation?.expires_at || new Date(moderation.expires_at) > new Date();
    if (notExpired && ["suspended", "banned"].includes(moderation?.status)) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/account-status";
      destination.search = "";
      const restrictedResponse = NextResponse.redirect(destination);
      refreshedCookies.forEach(({ name, value, options }) => restrictedResponse.cookies.set(name, value, options));
      return restrictedResponse;
    }
  }
  return response;
}