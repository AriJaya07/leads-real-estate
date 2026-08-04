import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/features/auth/components/signup-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Create your workspace" };

export default function SignupPage() {
  return (
    <>
      <AuthCard>
        <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
          14 days free. No card. You&apos;ll be the owner.
        </p>

        <SignupForm />

        <p className="text-muted-foreground mt-5 text-center text-xs leading-relaxed">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </AuthCard>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-brand font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
