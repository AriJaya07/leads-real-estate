import type { Metadata } from "next";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { LoginForm } from "@/features/auth/components/login-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Sign in" };

async function Form() {
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  return <LoginForm isFirstRun={count === 0} />;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">DreamRue Lead Intelligence</h1>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to your workspace.</p>
          </div>
        </div>

        {/* Counting users is a database read, so it streams. */}
        <Suspense fallback={<div className="h-64" />}>
          <Form />
        </Suspense>
      </div>
    </main>
  );
}
