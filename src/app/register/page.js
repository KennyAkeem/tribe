import AuthForm from "@/app/auth/auth-form";

export const metadata = { title: "Create account — Tribe" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}