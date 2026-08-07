"use client";

import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { ApiKeyRevealModal } from "@/components/common/api-key-reveal-modal";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { useServerAction } from "@/hooks/use-server-action";
import { createApiKey, revokeApiKey } from "@/application/api-keys/api-key.actions";
import type { ApiKeyRow } from "@/infrastructure/db/schema/api-keys";
import { cn } from "@/lib/utils";

type KeyRow = Omit<ApiKeyRow, "keyHash">;

/** Real, persisted key management for `/api/v1/leads` — see `/docs/api`. */
export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const nameId = useId();
  const { busyId, run } = useServerAction();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    await run("create", () => createApiKey({ name }), {
      errorFallback: "Could not create the key",
      onSuccess: (result) => {
        setNewName("");
        setCreating(false);
        setReveal(result.secret);
      },
    });
  }

  async function revoke(key: KeyRow) {
    await run(key.id, () => revokeApiKey({ id: key.id }), {
      errorFallback: "Could not revoke the key",
      onSuccess: () => toast.success(`Revoked "${key.name}"`),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Popover open={creating} onOpenChange={setCreating}>
          <PopoverTrigger
            render={
              <Button size="sm">
                <KeyRound className="size-3.5" aria-hidden />
                Create key
              </Button>
            }
          />
          <PopoverContent align="end" className="p-4">
            <form onSubmit={createKey} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={nameId}>New key name</Label>
                <Input
                  id={nameId}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. CRM sync"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" size="sm" className="self-end" disabled={busyId === "create"}>
                Create key
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description="Create one to authenticate requests to the leads API."
        />
      ) : (
        <DataTable minWidth="min-w-[640px]">
          <DataTableHead>
            <th>Name</th>
            <th>Key</th>
            <th className="w-28">Scope</th>
            <th className="w-28">Last used</th>
            <th className="w-24">Actions</th>
          </DataTableHead>
          <tbody>
            {keys.map((key) => {
              const revoked = key.revokedAt !== null;
              return (
                <tr key={key.id} className={cn("border-border border-t", revoked && "opacity-60")}>
                  <td className="px-3 py-2.5 font-medium">{key.name}</td>
                  <td className="text-muted-foreground px-3 py-2.5 font-mono text-xs">{key.keyPrefix}</td>
                  <td className="px-3 py-2.5">
                    {revoked ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">{key.scope}</Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">
                    <RelativeTime value={key.lastUsedAt} />
                  </td>
                  <td className="px-3 py-2.5">
                    {!revoked && (
                      <ConfirmDeleteDialog
                        trigger={
                          <Button size="sm" variant="destructive" disabled={busyId === key.id}>
                            Revoke
                          </Button>
                        }
                        title={`Revoke "${key.name}"?`}
                        description="Any request using this key stops working immediately. This can't be undone."
                        confirmLabel="Revoke"
                        onConfirm={() => void revoke(key)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      <ApiKeyRevealModal open={reveal !== null} secret={reveal} onDone={() => setReveal(null)} />
    </div>
  );
}
