"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { signIn } from "@/application/auth/login.actions";

export function LoginForm({ isFirstRun }: { isFirstRun: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await signIn({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Enter a valid email address and password.");
      return;
    }

    router.push("/leads");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {isFirstRun && (
        <p className="border-border bg-muted/50 text-muted-foreground rounded-lg border p-3 text-sm">
          No accounts exist yet. The email and password you enter here become the
          first admin account.
        </p>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@company.com"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={isFirstRun ? "new-password" : "current-password"}
          placeholder={isFirstRun ? "At least 10 characters" : "••••••••"}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        {isFirstRun ? "Create admin account" : "Sign in"}
      </Button>

      {!isFirstRun && (
        <p className="text-muted-foreground text-center text-xs">
          Lost your password? An admin can reset it from Admin → Team.
        </p>
      )}
    </form>
  );
}
