"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { FormError } from "@/features/auth/components/form-error";
import { signIn } from "@/application/auth/login.actions";

export function LoginForm() {
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
      {error && <FormError>{error}</FormError>}

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
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-muted-foreground text-xs underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={error ? true : undefined}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Sign in
      </Button>
    </form>
  );
}
