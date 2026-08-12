"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { FormError } from "@/features/auth/components/form-error";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { acceptInvite } from "@/application/auth/invite.actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await acceptInvite({
      token,
      name: String(form.get("name") ?? "") || undefined,
      password: String(form.get("password") ?? ""),
    });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Enter a valid name and password.");
      return;
    }

    router.push("/leads");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" type="text" autoFocus placeholder="Optional" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Set a password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="new-password"
          placeholder="At least 10 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Join the team
      </Button>
    </form>
  );
}
