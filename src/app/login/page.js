import AuthForm from "@/app/auth/auth-form";

export const metadata = { title: "Sign in — Tribe" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}