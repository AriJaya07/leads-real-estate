"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { addTeamMember, createTeam, deleteTeam, removeTeamMember } from "@/application/teams/team.actions";
import { useServerAction } from "@/hooks/use-server-action";
import type { TeamSummary } from "@/application/teams/team-queries";

interface AssignableMember {
  id: string;
  name: string | null;
  email: string;
}

/**
 * Sub-groups within the company — a different, additional concept from the
 * roster above (`TeamTable`), which already owns "team" for company-wide
 * user management. See docs/saas-database-schema.md.
 */
export function TeamsPanel({ teams, members }: { teams: TeamSummary[]; members: AssignableMember[] }) {
  const { busyId, run } = useServerAction();
  const busy = busyId !== null;
  const [addingTo, setAddingTo] = useState<string | null>(null);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run("new-team", () => createTeam({ name: String(data.get("name") ?? "") }), {
      errorFallback: "Could not create the team",
      onSuccess: () => form.reset(),
    });
  }

  async function onDelete(teamId: string) {
    await run(teamId, () => deleteTeam({ teamId }));
  }

  async function onAddMember(teamId: string, userId: string) {
    await run(teamId, () => addTeamMember({ teamId, userId }), {
      errorFallback: "Could not add that teammate",
      onSuccess: () => setAddingTo(null),
    });
  }

  async function onRemoveMember(teamId: string, userId: string) {
    await run(teamId, () => removeTeamMember({ teamId, userId }));
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onCreate} className="border-border flex items-end gap-3 rounded-xl border p-4">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="new-team-name">New team</Label>
          <Input id="new-team-name" name="name" required placeholder="Sales Team Bali" />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" aria-hidden />}
          Create team
        </Button>
      </form>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          description="Optional — most companies don't need this. Create one to group agents into sub-teams (e.g. by city)."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {teams.map((team) => {
            const availableToAdd = members.filter((m) => !team.members.some((tm) => tm.userId === m.id));
            return (
              <div key={team.id} data-team-name={team.name} className="border-border rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{team.name}</div>
                    {team.description && (
                      <div className="text-muted-foreground text-xs">{team.description}</div>
                    )}
                  </div>
                  <ConfirmDeleteDialog
                    trigger={
                      <Button size="icon" variant="outline" aria-label={`Delete ${team.name}`} disabled={busy}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    }
                    title={`Delete "${team.name}"?`}
                    description="Members lose this grouping. This can't be undone."
                    confirmLabel="Delete"
                    onConfirm={() => void onDelete(team.id)}
                  />
                </div>

                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {team.members.map((member) => (
                    <li
                      key={member.userId}
                      className="border-border bg-muted/40 flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
                    >
                      {member.name ?? member.email}
                      <button
                        type="button"
                        aria-label={`Remove ${member.email} from ${team.name}`}
                        disabled={busy}
                        onClick={() => void onRemoveMember(team.id, member.userId)}
                        className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                  {team.members.length === 0 && (
                    <li className="text-muted-foreground text-xs">No members yet</li>
                  )}
                </ul>

                {addingTo === team.id ? (
                  <select
                    autoFocus
                    disabled={busy}
                    defaultValue=""
                    onChange={(event) => event.target.value && void onAddMember(team.id, event.target.value)}
                    onBlur={() => setAddingTo(null)}
                    className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                  >
                    <option value="" disabled>
                      Pick a teammate…
                    </option>
                    {availableToAdd.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || availableToAdd.length === 0}
                    onClick={() => setAddingTo(team.id)}
                  >
                    <UserPlus className="size-3.5" aria-hidden />
                    Add member
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
