import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginSuccess from "./success-countdown";

export const metadata = { title: "Welcome to Tribe" };

export default async function LoginSuccessPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const requestedNext = params?.next ?? "/dashboard";
  const destination = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")
    ? requestedNext
    : "/dashboard";

  return <LoginSuccess destination={destination} verified={params?.verified === "1"} />;
}