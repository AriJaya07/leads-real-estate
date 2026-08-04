import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard>
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6 text-sm">Welcome back.</p>

      <LoginForm />

      <p className="text-muted-foreground mt-6 text-center text-sm">
        No account?{" "}
        <Link href="/signup" className="text-brand font-medium underline underline-offset-4">
          Start a trial
        </Link>
      </p>
    </AuthCard>
  );
}
