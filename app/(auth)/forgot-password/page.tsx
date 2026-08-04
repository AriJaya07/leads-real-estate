import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
        Enter your email and we&apos;ll send a link to reset it.
      </p>

      <ForgotPasswordForm />

      <p className="text-muted-foreground mt-6 text-center text-sm">
        <Link href="/login" className="text-brand font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
