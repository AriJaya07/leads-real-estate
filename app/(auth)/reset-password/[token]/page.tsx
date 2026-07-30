import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { isPasswordResetTokenValid } from "@/application/auth/password-reset.actions";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Reset password" };

async function ResetPasswordContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isPasswordResetTokenValid(token);

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark className="size-11" />
        {valid ? (
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
            <p className="text-muted-foreground mt-1 text-sm">Choose a new password for your account.</p>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Link expired</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              This reset link is invalid or has expired. Request a new one.
            </p>
          </div>
        )}
      </div>

      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
            Request a new link
          </Link>
        </p>
      )}
    </>
  );
}

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Suspense fallback={<BrandMark className="mx-auto size-11" />}>
          <ResetPasswordContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}
