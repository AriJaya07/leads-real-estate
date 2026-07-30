"use client";

import { useState } from "react";
import { Copy, KeyRound, Mail, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/common/relative-time";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { Spinner } from "@/components/common/spinner";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import type { Role } from "@/domain/auth/permissions";
import {
  removeTeamMember,
  resetTeamMemberPassword,
  setTeamMemberRole,
} from "@/application/auth/team.actions";
import { inviteTeamMember, revokeInvite } from "@/application/auth/invite.actions";
import { useServerAction } from "@/hooks/use-server-action";

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

      <form
        onSubmit={invite}
        className="border-border flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
          />
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
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner className="size-3.5" /> : <Mail className="size-3.5" aria-hidden />}
          Invite
        </Button>
      </form>

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Pending invites
          </h3>
          <div className="flex flex-col gap-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{invite.email}</span>{" "}
                  <span className="text-muted-foreground capitalize">· {invite.role}</span>
                  {invite.expired && <span className="text-destructive"> · expired</span>}
                </div>
                <Button
                  size="icon"
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
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          title="No team members yet"
          description="Invite the first teammate above — they&rsquo;ll get an email to set their password."
        />
      ) : (
        <DataTable minWidth="min-w-[720px]">
          <DataTableHead>
            <th>Member</th>
            <th className="w-32">Role</th>
            <th className="w-36">Last seen</th>
            <th className="w-44">Actions</th>
          </DataTableHead>
          <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-border border-t">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">
                      {member.name ?? member.email}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {member.name ? member.email : null}
                      {member.mustChangePassword && " · must change password"}
                      {member.id === currentUserId && " · you"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      disabled={busy || member.id === currentUserId}
                      value={member.role}
                      onChange={(event) => void changeRole(member, event.target.value as Role)}
                      title={member.id === currentUserId ? "You cannot change your own role" : "Change role"}
                      className="border-input bg-background h-8 rounded-md border px-2 text-xs capitalize disabled:opacity-60"
                    >
                      {ASSIGNABLE_ROLES.filter(
                        (r) => r.value === member.role || r.value !== "owner" || viewerRole === "owner",
                      ).map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">
                    <RelativeTime value={member.lastSeenAt} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void resetPassword(member)}
                      >
                        <KeyRound className="size-3.5" aria-hidden />
                        Reset
                      </Button>
                      <ConfirmDeleteDialog
                        trigger={
                          <Button
                            size="icon"
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
                  </td>
                </tr>
              ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
