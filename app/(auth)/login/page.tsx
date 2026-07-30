import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">DreamRue Lead Intelligence</h1>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to your workspace.</p>
          </div>
        </div>

        <LoginForm />

        <p className="text-muted-foreground mt-6 text-center text-sm">
          New here?{" "}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create a company
          </Link>
        </p>
      </div>
    </main>
  );
}
