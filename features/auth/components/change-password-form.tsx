"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { changePassword } from "@/application/auth/login.actions";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
    });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Enter your current password and a new password of at least 10 characters.");
      return;
    }

    // A full navigation, not router.push — the action already re-issued the
    // session cookie for this device, but the client router's own segment
    // cache can still serve a redirect-to-/account response it fetched
    // moments earlier (e.g. the forced redirect that landed the user here in
    // the first place). A fresh document request has no such cache to be
    // stale against.
    window.location.href = "/leads";
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {forced && (
        <p className="border-border bg-muted/50 text-muted-foreground rounded-lg border p-3 text-sm">
          You&rsquo;re signed in with a temporary password. Choose a new one to continue.
        </p>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 10 characters"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Change password
      </Button>
    </form>
  );
}
