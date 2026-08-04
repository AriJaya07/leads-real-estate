"use client";

import { useState } from "react";
import { Copy, KeyRound, Mail, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/common/relative-time";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { Spinner } from "@/components/common/spinner";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Role } from "@/domain/auth/permissions";
import {
  removeTeamMember,
  resetTeamMemberPassword,
  setTeamMemberRole,
} from "@/application/auth/team.actions";
import { inviteTeamMember, revokeInvite } from "@/application/auth/invite.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";

const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
];

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  mustChangePassword: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
}

/**
 * Purely decorative — a deterministic pick from the app's own intent hues so
 * every row gets a distinct avatar colour without inventing a new palette.
 * Never carries meaning (unlike `IntentBadge`'s use of the same tokens), so
 * no label is needed alongside it.
 */
const AVATAR_PALETTE = [
  "bg-intent-buyer/15 text-intent-buyer",
  "bg-intent-seller/15 text-intent-seller",
  "bg-intent-agent/15 text-intent-agent",
  "bg-intent-broker/15 text-intent-broker",
  "bg-intent-investor/15 text-intent-investor",
];

function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(name: string | null, email: string): string {
  const source = (name?.trim() || email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Shown once. It is not recoverable afterwards — only the hash is stored. */
function CredentialNotice({
  title,
  credential,
  onDismiss,
}: {
  title: string;
  credential: string;
  onDismiss: () => void;
}) {
  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex items-center gap-2">
        <code className="bg-background border-border flex-1 truncate rounded-md border px-3 py-2 font-mono text-sm">
          {credential}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(credential);
            toast.success("Copied");
          }}
        >
          <Copy className="size-3.5" aria-hidden />
          Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Shown once — save it now.</p>
    </div>
  );
}

export function TeamTable({
  members,
  pendingInvites,
  currentUserId,
  viewerRole,
}: {
  members: Member[];
  pendingInvites: PendingInvite[];
  currentUserId: string;
  viewerRole: Role;
}) {
  const { busyId, run } = useServerAction();
  const busy = busyId !== null;
  const [notice, setNotice] = useState<{ title: string; credential: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  const assignableRoles = ASSIGNABLE_ROLES.filter((r) => r.value !== "owner" || viewerRole === "owner");

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    await run(
      "invite",
      () =>
        inviteTeamMember({
          email: String(data.get("email") ?? ""),
          role: (String(data.get("role") ?? "member") as Role) ?? "member",
        }),
      {
        errorFallback: "Could not send the invite",
        onSuccess: (result) => {
          form.reset();
          setInviting(false);
          if (result.emailSent) {
            toast.success(`Invite emailed to ${result.email}`);
          } else {
            setNotice({ title: `Invite link for ${result.email}`, credential: result.inviteUrl });
          }
        },
      },
    );
  }

  async function cancelInvite(invite: PendingInvite) {
    await run("revoke", () => revokeInvite({ inviteId: invite.id }), {
      onSuccess: () => toast.success(`Canceled invite for ${invite.email}`),
    });
  }

  async function resetPassword(member: Member) {
    await run("reset", () => resetTeamMemberPassword({ userId: member.id }), {
      errorFallback: "Could not reset the password",
      onSuccess: (credential) =>
        setNotice({ title: `Temporary password for ${credential.email}`, credential: credential.temporaryPassword }),
    });
  }

  async function changeRole(member: Member, role: Role) {
    if (role === member.role) return;
    await run("role", () => setTeamMemberRole({ userId: member.id, role }));
  }

  async function remove(member: Member) {
    await run("remove", () => removeTeamMember({ userId: member.id }), {
      onSuccess: () => toast.success(`Removed ${member.email}`),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && <CredentialNotice {...notice} onDismiss={() => setNotice(null)} />}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <Button size="sm" onClick={() => setInviting(true)}>
          <Mail className="size-3.5" aria-hidden />
          Invite
        </Button>
      </div>

      {members.length === 0 && pendingInvites.length === 0 ? (
        <EmptyState
          title="No team members yet"
          description="Invite the first teammate above — they&rsquo;ll get an email to set their password."
        />
      ) : (
        <div className="border-border divide-border flex flex-col divide-y rounded-xl border">
          {members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  avatarTone(member.id),
                )}
                aria-hidden
              >
                {initials(member.name, member.email)}
              </div>

              <div className="min-w-40 flex-1">
                <div className="truncate text-sm font-medium">{member.name ?? member.email}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {member.name ? member.email : "Last active "}
                  {!member.name && <RelativeTime value={member.lastSeenAt} />}
                  {member.mustChangePassword && " · must change password"}
                  {member.id === currentUserId && " · you"}
                </div>
              </div>

              {member.name && (
                <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                  Last seen <RelativeTime value={member.lastSeenAt} />
                </span>
              )}

              <select
                disabled={busy || member.id === currentUserId}
                value={member.role}
                onChange={(event) => void changeRole(member, event.target.value as Role)}
                title={member.id === currentUserId ? "You cannot change your own role" : "Change role"}
                className="border-input bg-background h-8 shrink-0 rounded-lg border px-2 text-xs capitalize disabled:opacity-60"
              >
                {ASSIGNABLE_ROLES.filter(
                  (r) => r.value === member.role || r.value !== "owner" || viewerRole === "owner",
                ).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Reset password for ${member.email}`}
                  title="Reset password"
                  disabled={busy}
                  onClick={() => void resetPassword(member)}
                >
                  <KeyRound className="size-3.5" aria-hidden />
                </Button>
                <ConfirmDeleteDialog
                  trigger={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Remove ${member.email}`}
                      disabled={busy || member.id === currentUserId}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  }
                  title={`Remove ${member.name ?? member.email}?`}
                  description="They lose access to this company immediately. They'd need a new invite to rejoin."
                  confirmLabel="Remove"
                  onConfirm={() => void remove(member)}
                />
              </div>
            </div>
          ))}

          {pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
              <div className="border-muted-foreground/40 size-8 shrink-0 rounded-full border border-dashed" aria-hidden />
              <div className="min-w-40 flex-1">
                <div className="text-muted-foreground truncate text-sm">{invite.email}</div>
                <div className="text-muted-foreground text-xs">
                  {invite.expired ? "Invite expired" : (
                    <>
                      Invited <RelativeTime value={invite.createdAt} />
                    </>
                  )}
                  {" · "}
                  <span className="capitalize">{invite.role}</span>
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Cancel invite for ${invite.email}`}
                disabled={busy}
                onClick={() => void cancelInvite(invite)}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={inviting} onOpenChange={setInviting}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite a teammate</SheetTitle>
            <SheetDescription>
              Without a mail provider configured, the invite link is shown on screen to copy and send yourself.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={invite} className="flex flex-1 flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required placeholder="teammate@company.com" autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                name="role"
                defaultValue="member"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {assignableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-auto flex gap-2 pt-2">
              <Button type="submit" size="sm" disabled={busyId === "invite"}>
                {busyId === "invite" ? <Spinner className="size-3.5" /> : <UserPlus className="size-3.5" aria-hidden />}
                Send invite
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setInviting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
