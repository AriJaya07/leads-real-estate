import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Enter your email and we&apos;ll send a link to reset it.
            </p>
          </div>
        </div>

        <ForgotPasswordForm />

        <p className="text-muted-foreground mt-6 text-center text-sm">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
