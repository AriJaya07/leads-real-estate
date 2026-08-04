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
import { cn } from "@/lib/utils";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: "leads:read" | "leads:write";
  createdAt: Date;
  lastUsedAt: Date | null;
  revoked: boolean;
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `drk_live_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Lazy `useState` initializer — a plain helper (not a component/hook), so the render body itself never touches `Date.now()`. */
function seedKeys(): ApiKeyRow[] {
  const now = Date.now();
  return [
    {
      id: "1",
      name: "CRM sync",
      prefix: "drk_live_8fa2…",
      scope: "leads:read",
      createdAt: new Date(now - 40 * 86_400_000),
      lastUsedAt: new Date(now - 4 * 3_600_000),
      revoked: false,
    },
    {
      id: "2",
      name: "Old export script",
      prefix: "drk_live_1c07…",
      scope: "leads:read",
      createdAt: new Date(now - 200 * 86_400_000),
      lastUsedAt: new Date(now - 60 * 86_400_000),
      revoked: true,
    },
  ];
}

/**
 * Designed now, built when a real second consumer exists — per
 * `saas-platform-architecture.md` §6, the API-key *infrastructure* isn't
 * built ahead of a real second consumer. This page is deliberately
 * local-state only (no persistence, no backend route): it's the UI surface
 * ready to wire up the moment that changes, not a feature pretending to be
 * live today.
 */
export function ApiKeysManager() {
  const nameId = useId();
  const [keys, setKeys] = useState<ApiKeyRow[]>(seedKeys);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const secret = randomKey();
    setKeys((prev) => [
      {
        id: crypto.randomUUID(),
        name,
        prefix: `${secret.slice(0, 13)}…`,
        scope: "leads:read",
        createdAt: new Date(),
        lastUsedAt: null,
        revoked: false,
      },
      ...prev,
    ]);
    setNewName("");
    setCreating(false);
    setReveal(secret);
  }

  function revoke(key: ApiKeyRow) {
    setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, revoked: true } : k)));
    toast.success(`Revoked "${key.name}"`);
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
              <Button type="submit" size="sm" className="self-end">
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
            {keys.map((key) => (
              <tr key={key.id} className={cn("border-border border-t", key.revoked && "opacity-60")}>
                <td className="px-3 py-2.5 font-medium">{key.name}</td>
                <td className="text-muted-foreground px-3 py-2.5 font-mono text-xs">{key.prefix}</td>
                <td className="px-3 py-2.5">
                  {key.revoked ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : (
                    <Badge variant="secondary">{key.scope}</Badge>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2.5 text-xs">
                  <RelativeTime value={key.lastUsedAt} />
                </td>
                <td className="px-3 py-2.5">
                  {!key.revoked && (
                    <ConfirmDeleteDialog
                      trigger={
                        <Button size="sm" variant="destructive">
                          Revoke
                        </Button>
                      }
                      title={`Revoke "${key.name}"?`}
                      description="Any request using this key stops working immediately. This can't be undone."
                      confirmLabel="Revoke"
                      onConfirm={() => revoke(key)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <ApiKeyRevealModal open={reveal !== null} secret={reveal} onDone={() => setReveal(null)} />
    </div>
  );
}
