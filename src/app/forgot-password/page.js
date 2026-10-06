import AuthForm from "@/app/auth/auth-form";

export const metadata = { title: "Reset password — Tribe" };

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}