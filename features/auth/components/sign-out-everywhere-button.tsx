"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOutEverywhere } from "@/application/auth/login.actions";

/** Revokes every session for this account — including this one — and returns to /login. */
export function SignOutEverywhereButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const result = await signOutEverywhere();
    setPending(false);

    if (!result?.data) {
      toast.error(result?.serverError ?? "Could not sign out everywhere");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" disabled={pending} onClick={() => void run()}>
      <LogOut className="size-3.5" aria-hidden />
      Sign out everywhere
    </Button>
  );
}
