import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getInviteByToken } from "@/application/auth/invite.actions";
import { AcceptInviteForm } from "@/features/auth/components/accept-invite-form";
import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/domain/auth/permissions";

export const metadata: Metadata = { title: "Accept invite" };

/** Two-letter avatar initials derived from the real company name — never fabricated. */
function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * What each role actually unlocks, grounded in the real nav split in
 * `features/shell/nav-items.ts` (base `NAV` vs. `MANAGER_NAV` /
 * `ADMIN_NAV` / `OWNER_NAV`) — kept as a `Record<Role, string>` so adding a
 * role to the permission model is a type error here until it's described.
 */
const ROLE_ACCESS_DESCRIPTION: Record<Role, string> = {
  member: "the inbox, the pipeline and the intelligence view. Admin settings stay with your managers.",
  manager:
    "the inbox, the pipeline, the intelligence view, plus analytics and data collection tools. Team and billing settings stay with your admins.",
  admin:
    "the inbox, the pipeline, the intelligence view, analytics and data tools, plus team, alerts, automation and API keys. Billing stays with the owner.",
  owner: "the full workspace — inbox, pipeline, intelligence, analytics, data tools, team, automation, and billing.",
};

/** Rounded up so a link that expires in a few hours never reads as "0 days". */
function daysUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/** "a member"/"a manager" vs. "an admin"/"an owner" — every role name is real, so the grammar has to be too. */
function withArticle(role: Role): string {
  return /^[aeiou]/i.test(role) ? `an ${role}` : `a ${role}`;
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

  const expiresInDays = daysUntil(invite.expiresAt);

  return (
    <AuthCard>
      <div
        className="bg-brand/10 text-brand mb-4 grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold"
        aria-hidden
      >
        {companyInitials(invite.companyName)}
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-balance">
        {invite.invitedBy} invited you to {invite.companyName}
      </h1>
      <p className="text-muted-foreground mt-2 mb-6 text-sm leading-relaxed">
        You&apos;ll join as{" "}
        <strong className="text-foreground font-medium">{withArticle(invite.role as Role)}</strong> — you&apos;ll see{" "}
        {ROLE_ACCESS_DESCRIPTION[invite.role as Role]}
      </p>

      <div className="mb-4 flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={invite.email} disabled readOnly />
      </div>

      <AcceptInviteForm token={token} />

      <p className="text-muted-foreground mt-5 text-center text-xs leading-relaxed">
        Invite expires in {expiresInDays} day{expiresInDays === 1 ? "" : "s"}.
      </p>
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
