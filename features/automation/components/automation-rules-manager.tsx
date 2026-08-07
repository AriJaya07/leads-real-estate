"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/common/spinner";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { IntentBadge } from "@/components/common/intent-badge";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useServerAction } from "@/hooks/use-server-action";
import {
  createAutomationRule,
  deleteAutomationRule,
  setAutomationRuleEnabled,
  updateAutomationRule,
} from "@/application/automation/automation-rules.actions";
import { flattenAllOf } from "@/domain/alerting/predicate";
import type { AutomationRuleRow } from "@/infrastructure/db/schema/automation";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

const LEAD_TYPE_OPTIONS = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "agent", label: "Agent" },
  { value: "broker", label: "Broker" },
  { value: "investor", label: "Investor" },
  { value: "unknown", label: "Unknown" },
];

/** Inverse of `toPredicate` in `automation-rules.actions.ts` — reads the two conditions the form can produce back out of the stored `Predicate`. */
function conditionsFromPredicate(rule: AutomationRuleRow): { leadTypes: string[]; locations: string[] } {
  const flat = flattenAllOf(rule.predicate) ?? [];
  const leadTypes = flat.find((c) => c.field === "leadType");
  const locations = flat.find((c) => c.field === "locations");
  return {
    leadTypes: Array.isArray(leadTypes?.value) ? (leadTypes.value as string[]) : [],
    locations: Array.isArray(locations?.value) ? (locations.value as string[]) : [],
  };
}

function AutomationRuleForm({
  rule,
  teamMembers,
  onDone,
}: {
  rule?: AutomationRuleRow;
  teamMembers: TeamMember[];
  onDone: () => void;
}) {
  const { busyId, run } = useServerAction();
  const saving = busyId !== null;
  const existing = rule ? conditionsFromPredicate(rule) : { leadTypes: [], locations: [] };

  const [name, setName] = useState(rule?.name ?? "");
  const [leadTypes, setLeadTypes] = useState<string[]>(existing.leadTypes);
  const [locations, setLocations] = useState<string[]>(existing.locations);
  const [locationInput, setLocationInput] = useState("");
  const [action, setAction] = useState<"assign" | "hide">(rule?.action ?? "assign");
  const [assigneeId, setAssigneeId] = useState(rule?.assigneeId ?? "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  function toggleLeadType(value: string) {
    setLeadTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function addLocation() {
    const value = locationInput.trim().toLowerCase();
    setLocationInput("");
    if (!value || locations.includes(value)) return;
    setLocations((prev) => [...prev, value]);
  }

  function removeLocation(value: string) {
    setLocations((prev) => prev.filter((v) => v !== value));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (leadTypes.length === 0 && locations.length === 0) {
      toast.error("Add at least one condition.");
      return;
    }
    if (action === "assign" && !assigneeId) {
      toast.error("Choose who to assign matching leads to.");
      return;
    }

    const input = {
      name,
      enabled,
      leadTypes: leadTypes as ("buyer" | "seller" | "agent" | "broker" | "investor" | "unknown")[],
      locations,
      action,
      assigneeId: action === "assign" ? assigneeId : undefined,
      priority: rule?.priority ?? 0,
    };

    const result = rule
      ? await run("save", () => updateAutomationRule({ ...input, id: rule.id }), {
          errorFallback: "Could not save the rule",
        })
      : await run("save", () => createAutomationRule(input), { errorFallback: "Could not create the rule" });

    if (result) {
      toast.success(rule ? "Rule updated" : "Rule created");
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rule-name">Name</Label>
        <Input
          id="rule-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          placeholder="Canggu buyers to Agus"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>WHEN lead type is</Label>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={leadTypes.includes(option.value)}
              onClick={() => toggleLeadType(option.value)}
              className={cn(
                "border-border rounded-full border px-2.5 py-1 text-xs transition-colors",
                leadTypes.includes(option.value) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>AND location is one of</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {locations.map((location) => (
            <span key={location} className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
              {location}
              <button
                type="button"
                aria-label={`Remove ${location}`}
                onClick={() => removeLocation(location)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <Input
            value={locationInput}
            onChange={(event) => setLocationInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLocation();
              }
            }}
            onBlur={addLocation}
            placeholder="Add a location…"
            className="h-7 w-32 border-dashed text-xs"
          />
        </div>
        <p className="text-muted-foreground text-xs">Leave both empty conditions unset and this rule matches every lead — not allowed.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>THEN</Label>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant={action === "assign" ? "default" : "outline"} onClick={() => setAction("assign")}>
            Assign to
          </Button>
          <Button type="button" size="sm" variant={action === "hide" ? "default" : "outline"} onClick={() => setAction("hide")}>
            Hide from inbox
          </Button>
        </div>
      </div>

      {action === "assign" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-assignee">Assignee</Label>
          <select
            id="rule-assignee"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            required
            className="border-input bg-background rounded-md border px-2.5 py-1.5 text-sm"
          >
            <option value="">Choose a teammate…</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Only fills in leads nobody has assigned yet — never overrides a manual assignment.</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="rule-enabled" className="font-normal">
          Enabled
        </Label>
      </div>

      <div className="mt-2 flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Spinner className="size-4" />}
          {rule ? "Save changes" : "Create rule"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const AutomationRuleTableRow = memo(function AutomationRuleTableRow({
  rule,
  teamMembers,
  busy,
  onToggle,
  onDelete,
  onEdit,
}: {
  rule: AutomationRuleRow;
  teamMembers: TeamMember[];
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { leadTypes, locations } = conditionsFromPredicate(rule);
  const assignee = teamMembers.find((m) => m.id === rule.assigneeId);

  return (
    <tr className="border-border border-t align-middle">
      <td className="px-3 py-2.5">
        <div className="font-medium">{rule.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {leadTypes.map((type) => (
            <IntentBadge key={type} intent={type} />
          ))}
          {locations.map((location) => (
            <span key={location} className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[11px]">
              {location}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 text-sm">
        {rule.action === "assign" ? (
          <>
            Assign to <span className="font-medium">{assignee ? (assignee.name ?? assignee.email) : "—"}</span>
          </>
        ) : (
          "Hide from inbox"
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={rule.enabled ? `Disable ${rule.name}` : `Enable ${rule.name}`}
          />
          {busy && <Spinner className="size-3.5" />}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
          <ConfirmDeleteDialog
            trigger={
              <Button size="icon" variant="outline" aria-label={`Delete ${rule.name}`} disabled={busy}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            }
            title={`Delete "${rule.name}"?`}
            description="Leads stop being routed by this rule immediately. This can't be undone."
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </td>
    </tr>
  );
});

/**
 * WHEN/THEN routing rules — sits alongside the always-on toggles in
 * `AutomationSettingsForm` rather than replacing them; those four (auto-
 * assign round-robin, reminders, weekly report, webhook) aren't
 * condition-gated, these are. Reuses the alert-rule predicate engine
 * (`domain/alerting/predicate.ts`) so a rule fires from the same
 * sync-pipeline hook alert/webhook dispatch already use — see
 * `application/automation/apply-automation-rules.ts`.
 */
export function AutomationRulesManager({ rules, teamMembers }: { rules: AutomationRuleRow[]; teamMembers: TeamMember[] }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AutomationRuleRow | null>(null);

  const toggle = useCallback(
    async (rule: AutomationRuleRow) => {
      await run(rule.id, () => setAutomationRuleEnabled({ id: rule.id, enabled: !rule.enabled }), {
        errorFallback: "Could not update the rule",
        onSuccess: () => {
          toast.success(`${rule.name} is now ${rule.enabled ? "disabled" : "enabled"}`);
          router.refresh();
        },
      });
    },
    [run, router],
  );

  const remove = useCallback(
    async (rule: AutomationRuleRow) => {
      await run(`delete-${rule.id}`, () => deleteAutomationRule({ id: rule.id }), {
        errorFallback: "Could not delete the rule",
        onSuccess: () => {
          toast.success(`Deleted "${rule.name}"`);
          router.refresh();
        },
      });
    },
    [run, router],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Routing rules</h2>
          <p className="text-muted-foreground text-xs">
            WHEN a lead matches, THEN assign it or keep it out of the inbox — evaluated the moment a lead is created or
            re-scored.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" aria-hidden />
          New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No routing rules yet"
          description="Create a rule to auto-assign leads by type or area, or keep a category out of the inbox entirely."
        />
      ) : (
        <DataTable minWidth="min-w-[720px]">
          <DataTableHead>
            <th>Rule</th>
            <th className="w-56">Action</th>
            <th className="w-28">Status</th>
            <th className="w-40">Actions</th>
          </DataTableHead>
          <tbody>
            {rules.map((rule) => (
              <AutomationRuleTableRow
                key={rule.id}
                rule={rule}
                teamMembers={teamMembers}
                busy={busyId === rule.id || busyId === `delete-${rule.id}`}
                onToggle={() => toggle(rule)}
                onDelete={() => remove(rule)}
                onEdit={() => setEditing(rule)}
              />
            ))}
          </tbody>
        </DataTable>
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New routing rule</SheetTitle>
            <SheetDescription>Runs automatically the moment a matching lead is created or re-scored.</SheetDescription>
          </SheetHeader>
          {creating && (
            <AutomationRuleForm
              teamMembers={teamMembers}
              onDone={() => {
                setCreating(false);
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit routing rule</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          {editing && (
            <AutomationRuleForm
              rule={editing}
              teamMembers={teamMembers}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
