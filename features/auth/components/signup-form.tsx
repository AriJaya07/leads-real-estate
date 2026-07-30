"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { signUp } from "@/application/auth/signup.actions";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await signUp({
      companyName: String(form.get("companyName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Check your company name, email, and password.");
      return;
    }

    router.push("/leads");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input id="companyName" name="companyName" type="text" required autoFocus placeholder="Acme Realty" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
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
          autoComplete="new-password"
          placeholder="At least 10 characters"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Create company
      </Button>
    </form>
  );
}
