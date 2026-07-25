import type { Metadata } from "next";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";
import { LoginForm } from "@/features/auth/components/login-form";
import { BrandMark } from "@/components/brand/brand-mark";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

async function Form() {
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  return <LoginForm isFirstRun={count === 0} />;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

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

        {/* Counting users is a database read, so it streams. */}
        <Suspense fallback={<FormSkeleton />}>
          <Form />
        </Suspense>
      </div>
    </main>
  );
}
