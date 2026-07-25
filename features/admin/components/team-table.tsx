"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/common/relative-time";
import { Label } from "@/components/ui/label";
import {
  createTeamMember,
  removeTeamMember,
  resetTeamMemberPassword,
  setTeamMemberRole,
} from "@/application/auth/team.actions";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "agent";
  mustChangePassword: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

/** Shown once. It is not recoverable afterwards — only the hash is stored. */
function CredentialNotice({
  credential,
  onDismiss,
}: {
  credential: { email: string; temporaryPassword: string };
  onDismiss: () => void;
}) {
  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-sm font-medium">Temporary password for {credential.email}</p>
      <div className="flex items-center gap-2">
        <code className="bg-background border-border flex-1 rounded-md border px-3 py-2 font-mono text-sm">
          {credential.temporaryPassword}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(credential.temporaryPassword);
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
      <p className="text-muted-foreground text-xs">
        Shown once — only the hash is stored. Send it over a channel you trust; they must
        change it on first sign-in.
      </p>
    </div>
  );
}

export function TeamTable({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<{ email: string; temporaryPassword: string } | null>(
    null,
  );

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);

    const result = await createTeamMember({
      email: String(data.get("email") ?? ""),
      name: String(data.get("name") ?? "") || undefined,
      role: (String(data.get("role") ?? "agent") as "admin" | "agent") ?? "agent",
    });

    setBusy(false);

    if (!result?.data) {
      toast.error(result?.serverError ?? "Could not create the account");
      return;
    }
    setCredential(result.data);
    form.reset();
    router.refresh();
  }

  async function resetPassword(member: Member) {
    setBusy(true);
    const result = await resetTeamMemberPassword({ userId: member.id });
    setBusy(false);

    if (!result?.data) {
      toast.error(result?.serverError ?? "Could not reset the password");
      return;
    }
    setCredential(result.data);
    router.refresh();
  }

  async function changeRole(member: Member) {
    setBusy(true);
    const result = await setTeamMemberRole({
      userId: member.id,
      role: member.role === "admin" ? "agent" : "admin",
    });
    setBusy(false);

    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }
    router.refresh();
  }

  async function remove(member: Member) {
    setBusy(true);
    const result = await removeTeamMember({ userId: member.id });
    setBusy(false);

    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success(`Removed ${member.email}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {credential && (
        <CredentialNotice credential={credential} onDismiss={() => setCredential(null)} />
      )}

      <form
        onSubmit={addMember}
        className="border-border flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="new-email">Email</Label>
          <Input id="new-email" name="email" type="email" required placeholder="agent@company.com" />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="new-name">Name</Label>
          <Input id="new-name" name="name" placeholder="Optional" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-role">Role</Label>
          <select
            id="new-role"
            name="role"
            defaultValue="agent"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="size-3.5" aria-hidden />
          )}
          Add member
        </Button>
      </form>

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Member</th>
              <th className="w-28">Role</th>
              <th className="w-36">Last seen</th>
              <th className="w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-border border-t">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{member.name ?? member.email}</div>
                  <div className="text-muted-foreground text-xs">
                    {member.name ? member.email : null}
                    {member.mustChangePassword && " · must change password"}
                    {member.id === currentUserId && " · you"}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    disabled={busy || member.id === currentUserId}
                    onClick={() => void changeRole(member)}
                    className="border-border rounded-full border px-2 py-0.5 text-xs capitalize disabled:opacity-60"
                    title={
                      member.id === currentUserId
                        ? "You cannot change your own role"
                        : `Make ${member.role === "admin" ? "agent" : "admin"}`
                    }
                  >
                    {member.role}
                  </button>
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
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Remove ${member.email}`}
                      disabled={busy || member.id === currentUserId}
                      onClick={() => void remove(member)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
