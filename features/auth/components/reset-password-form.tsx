"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { FormError } from "@/features/auth/components/form-error";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { resetPassword } from "@/application/auth/password-reset.actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await resetPassword({ token, password: String(form.get("password") ?? "") });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Use at least 10 characters.");
      return;
    }

    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoFocus
          autoComplete="new-password"
          placeholder="At least 10 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Reset password
      </Button>
    </form>
  );
}
