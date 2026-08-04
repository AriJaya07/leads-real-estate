import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { isPasswordResetTokenValid } from "@/application/auth/password-reset.actions";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Reset password" };

async function ResetPasswordContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isPasswordResetTokenValid(token);

  return (
    <AuthCard>
      {valid ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
          <p className="text-muted-foreground mt-1.5 mb-6 text-sm">Choose a new password for your account.</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Link expired</h1>
          <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
            This reset link is invalid or has expired. Request a new one.
          </p>
          <p className="text-muted-foreground text-center text-sm">
            <Link href="/forgot-password" className="text-brand font-medium underline underline-offset-4">
              Request a new link
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<AuthCard />}>
      <ResetPasswordContent params={params} />
    </Suspense>
  );
}
