import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/features/auth/components/signup-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Create your company" };

export default function SignupPage() {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Create your company</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              You&apos;ll be the first admin — invite your team once you&apos;re in.
            </p>
          </div>
        </div>

        <SignupForm />

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
