import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getInviteByToken } from "@/application/auth/invite.actions";
import { AcceptInviteForm } from "@/features/auth/components/accept-invite-form";
import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Accept invite" };

/** Two-letter avatar initials derived from the real company name — never fabricated. */
function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

async function InviteContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold tracking-tight">Invite not found</h1>
        <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
          This link is invalid, already used, or has expired. Ask whoever invited you to send a new one.
        </p>
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="text-brand font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div
        className="bg-brand/10 text-brand mb-4 grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold"
        aria-hidden
      >
        {companyInitials(invite.companyName)}
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-balance">Join {invite.companyName}</h1>
      <p className="text-muted-foreground mt-2 mb-6 text-sm leading-relaxed">
        You&apos;ll join as a <strong className="text-foreground font-medium">{invite.role}</strong> — the inbox,
        the pipeline and the intelligence view. Admin settings stay with your managers.
      </p>

      <div className="mb-4 flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={invite.email} disabled readOnly />
      </div>

      <AcceptInviteForm token={token} />
    </AuthCard>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<AuthCard />}>
      <InviteContent params={params} />
    </Suspense>
  );
}
