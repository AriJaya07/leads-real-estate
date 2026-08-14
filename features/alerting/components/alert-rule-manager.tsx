"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/common/spinner";
import { DataTable, DataTableHead } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { IntentBadge } from "@/components/common/intent-badge";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useServerAction } from "@/hooks/use-server-action";
import {
  createAlertRule,
  deleteAlertRule,
  setAlertRuleEnabled,
  updateAlertRule,
} from "@/application/alerting/alert-rules.actions";
import {
  describePredicate,
  flattenAllOf,
  type Comparison,
  type ComparisonOp,
  type Predicate,
} from "@/domain/alerting/predicate";
import { RULE_CHANNELS, type ConditionField, type RuleChannel } from "@/domain/alerting/rule-fields";
import type { AlertRuleRow } from "@/infrastructure/db/schema/alerts";

const LEAD_TYPE_OPTIONS = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "agent", label: "Agent" },
  { value: "broker", label: "Broker" },
  { value: "investor", label: "Investor" },
  { value: "unknown", label: "Unknown" },
];

const DURATION_OPTIONS = [
  { value: "PT1H", label: "the last hour" },
  { value: "PT6H", label: "the last 6 hours" },
  { value: "P1D", label: "the last 24 hours" },
  { value: "P3D", label: "the last 3 days" },
  { value: "P7D", label: "the last 7 days" },
];

const OP_LABELS: Record<ComparisonOp, string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  in: "is one of",
  nin: "is not one of",
  contains: "contains",
  intersects: "includes any of",
  exists: "is present",
  within: "is within",
};

/** Compact symbols for the condition chips on the rule list — `OP_LABELS`'s prose form is used in the form's dropdown instead. */
const OP_SYMBOLS: Partial<Record<ComparisonOp, string>> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

type FieldKind = "enum" | "number" | "boolean" | "text" | "textList" | "duration";

interface FieldMeta {
  field: ConditionField;
  label: string;
  kind: FieldKind;
  ops: ComparisonOp[];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

type FieldMetaMap = Record<ConditionField, FieldMeta>;

interface Option {
  value: string;
  label: string;
}

function buildFieldMetas(propertyTypeOptions: Option[], locationOptions: Option[]): FieldMeta[] {
  return [
    { field: "leadType", label: "Lead type", kind: "enum", ops: ["eq", "neq"], options: LEAD_TYPE_OPTIONS },
    { field: "buyerScore", label: "Buyer score", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0, max: 100 },
    { field: "sellerScore", label: "Seller score", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0, max: 100 },
    { field: "investorScore", label: "Investor score", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0, max: 100 },
    { field: "confidenceScore", label: "Confidence score", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0, max: 100 },
    { field: "propertyTypes", label: "Property type", kind: "textList", ops: ["intersects"], options: propertyTypeOptions },
    { field: "locations", label: "Location", kind: "textList", ops: ["intersects"], options: locationOptions },
    { field: "budgetMin", label: "Budget min (USD)", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0 },
    { field: "budgetMax", label: "Budget max (USD)", kind: "number", ops: ["gte", "gt", "lte", "lt", "eq"], min: 0 },
    { field: "hasContact", label: "Has contact info", kind: "boolean", ops: ["eq"] },
    { field: "name", label: "Name", kind: "text", ops: ["contains"] },
    { field: "latestAppearanceAt", label: "Last active", kind: "duration", ops: ["within"], options: DURATION_OPTIONS },
  ];
}

function defaultValueForKind(kind: FieldKind, options?: Option[]): string {
  switch (kind) {
    case "boolean":
      return "true";
    case "enum":
      return options?.[0]?.value ?? "";
    case "duration":
      return DURATION_OPTIONS[0].value;
    case "number":
    case "text":
    case "textList":
      return "";
  }
}

interface ConditionRowState {
  key: string;
  field: ConditionField;
  op: ComparisonOp;
  value: string;
}

function newConditionRow(field: ConditionField, metas: FieldMetaMap): ConditionRowState {
  const meta = metas[field];
  return {
    key: `${field}-${Math.random().toString(36).slice(2, 9)}`,
    field,
    op: meta.ops[0],
    value: defaultValueForKind(meta.kind, meta.options),
  };
}

function toUiValue(value: unknown, kind: FieldKind): string {
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "textList") return Array.isArray(value) ? value.join(", ") : "";
  if (value === null || value === undefined) return "";
  return String(value);
}

function conditionsToRows(conditions: Comparison[], metas: FieldMetaMap): ConditionRowState[] {
  return conditions.map((c, index) => {
    const field = c.field as ConditionField;
    const meta = metas[field];
    return { key: `${field}-${index}`, field, op: c.op, value: toUiValue(c.value, meta.kind) };
  });
}

/**
 * A rule is only editable through this builder if its predicate is a flat
 * `all` of comparisons this builder itself can produce (see
 * `domain/alerting/predicate.ts::flattenAllOf`) *and* every field/op it uses
 * is one the builder knows, *and* every channel it uses has a checkbox here.
 * Anything else — a hand-seeded rule with a nested `any`, an appearance-level
 * field name, or the `slack`/`inapp` channels the builder doesn't offer —
 * falls back to view-only (enable/disable + delete) rather than risk the
 * builder silently dropping part of a rule it can't fully represent.
 */
function getEditableConditions(rule: AlertRuleRow, metas: FieldMetaMap): Comparison[] | null {
  if (!rule.channels.every((c): c is RuleChannel => (RULE_CHANNELS as readonly string[]).includes(c))) return null;
  const flat = flattenAllOf(rule.predicate);
  if (!flat) return null;
  const ok = flat.every((c) => {
    const meta = metas[c.field as ConditionField];
    return meta !== undefined && meta.ops.includes(c.op);
  });
  return ok ? flat : null;
}

/** `score ≥ 80`, `Location in Canggu, Seminyak` — the compact form used by the condition chips on the rule list. */
function conditionChipLabel(condition: Comparison, meta: FieldMeta): string {
  const symbol = OP_SYMBOLS[condition.op] ?? OP_LABELS[condition.op];
  const value = Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value);
  return `${meta.label} ${symbol} ${value}`;
}

interface RuleCondition {
  field: ConditionField;
  op: ComparisonOp;
  value: unknown;
}

function rowsToConditions(
  rows: ConditionRowState[],
  metas: FieldMetaMap,
): { conditions: RuleCondition[] } | { error: string } {
  const conditions: RuleCondition[] = [];
  for (const row of rows) {
    const meta = metas[row.field];
    switch (meta.kind) {
      case "number": {
        const trimmed = row.value.trim();
        const n = Number(trimmed);
        if (trimmed === "" || Number.isNaN(n)) return { error: `Enter a number for "${meta.label}".` };
        conditions.push({ field: row.field, op: row.op, value: n });
        break;
      }
      case "boolean":
        conditions.push({ field: row.field, op: row.op, value: row.value === "true" });
        break;
      case "textList": {
        const list = row.value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (list.length === 0) return { error: `Add at least one value for "${meta.label}".` };
        conditions.push({ field: row.field, op: row.op, value: list });
        break;
      }
      case "text": {
        if (!row.value.trim()) return { error: `Enter a value for "${meta.label}".` };
        conditions.push({ field: row.field, op: row.op, value: row.value.trim() });
        break;
      }
      case "enum":
      case "duration":
        conditions.push({ field: row.field, op: row.op, value: row.value });
        break;
    }
  }
  return { conditions };
}

function ConditionRowEditor({
  row,
  metas,
  fieldOrder,
  onChange,
  onRemove,
  canRemove,
}: {
  row: ConditionRowState;
  metas: FieldMetaMap;
  fieldOrder: FieldMeta[];
  onChange: (row: ConditionRowState) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const meta = metas[row.field];

  function setField(field: ConditionField) {
    onChange(newConditionRow(field, metas));
  }

  return (
    <div className="border-border grid grid-cols-1 items-start gap-2 rounded-lg border p-2">
      <select
        aria-label="Condition field"
        value={row.field}
        onChange={(event) => setField(event.target.value as ConditionField)}
        className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
      >
        {fieldOrder.map((m) => (
          <option key={m.field} value={m.field}>
            {m.label}
          </option>
        ))}
      </select>

      {meta.ops.length > 1 ? (
        <select
          aria-label="Condition operator"
          value={row.op}
          onChange={(event) => onChange({ ...row, op: event.target.value as ComparisonOp })}
          className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
        >
          {meta.ops.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-muted-foreground flex h-8 items-center px-1 text-xs">{OP_LABELS[meta.ops[0]]}</span>
      )}

      <div className="flex w-full flex-col gap-1">
        {meta.kind === "enum" && (
          <select
            aria-label="Condition value"
            value={row.value}
            onChange={(event) => onChange({ ...row, value: event.target.value })}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            {(meta.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {meta.kind === "duration" && (
          <select
            aria-label="Condition value"
            value={row.value}
            onChange={(event) => onChange({ ...row, value: event.target.value })}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {meta.kind === "boolean" && (
          <select
            aria-label="Condition value"
            value={row.value}
            onChange={(event) => onChange({ ...row, value: event.target.value })}
            className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        )}

        {meta.kind === "number" && (
          <Input
            aria-label="Condition value"
            type="number"
            min={meta.min}
            max={meta.max}
            value={row.value}
            onChange={(event) => onChange({ ...row, value: event.target.value })}
            className="h-8 w-full sm:w-28"
          />
        )}

        {meta.kind === "text" && (
          <Input
            aria-label="Condition value"
            value={row.value}
            onChange={(event) => onChange({ ...row, value: event.target.value })}
            placeholder="Contains…"
            className="h-8"
          />
        )}

        {meta.kind === "textList" && (
          <>
            <Input
              aria-label="Condition value"
              value={row.value}
              onChange={(event) => onChange({ ...row, value: event.target.value })}
              placeholder="Villa, Land"
              className="h-8"
            />
            {meta.options && meta.options.length > 0 && (
              <span className="text-muted-foreground truncate text-[11px]">
                Known values: {meta.options.map((o) => o.label).join(", ")}
              </span>
            )}
          </>
        )}
      </div>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Remove condition"
        disabled={!canRemove}
        onClick={onRemove}
        className="justify-self-end sm:justify-self-auto"
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function AlertRuleForm({
  rule,
  metas,
  fieldOrder,
  onDone,
}: {
  rule?: AlertRuleRow;
  metas: FieldMetaMap;
  fieldOrder: FieldMeta[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const busy = busyId === "alert-rule-form";

  const initialConditions = rule ? getEditableConditions(rule, metas) : null;

  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [channels, setChannels] = useState<Set<RuleChannel>>(
    () => new Set(rule ? RULE_CHANNELS.filter((c) => rule.channels.includes(c)) : ["email"]),
  );
  const [recipientsText, setRecipientsText] = useState(rule?.recipients.join(", ") ?? "");
  const [rows, setRows] = useState<ConditionRowState[]>(() =>
    initialConditions && initialConditions.length > 0
      ? conditionsToRows(initialConditions, metas)
      : [newConditionRow(fieldOrder[0].field, metas)],
  );
  const [error, setError] = useState<string | null>(null);

  function toggleChannel(channel: RuleChannel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  function updateRow(index: number, next: ConditionRowState) {
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));
  }
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }
  function addRow() {
    setRows((prev) => [...prev, newConditionRow(fieldOrder[0].field, metas)]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (channels.size === 0) {
      setError("Select at least one channel.");
      return;
    }
    const recipients = recipientsText
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }

    const result = rowsToConditions(rows, metas);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    const input = {
      name,
      description: description.trim() || undefined,
      enabled,
      channels: [...channels],
      recipients,
      conditions: result.conditions,
    };

    const onSuccess = () => {
      toast.success(rule ? `Updated "${name}"` : `Created "${name}"`);
      router.refresh();
      onDone();
    };

    if (rule) {
      await run("alert-rule-form", () => updateAlertRule({ ...input, id: rule.id }), {
        errorFallback: "Could not update the alert rule",
        onSuccess,
      });
    } else {
      await run("alert-rule-form", () => createAlertRule(input), {
        errorFallback: "Could not create the alert rule",
        onSuccess,
      });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="High-intent Bali buyer"
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="rule-enabled" className="font-normal">
            Enabled
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rule-description">Description</Label>
        <Input
          id="rule-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Shown to admins reviewing this rule"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Channels</Label>
        <div className="flex flex-wrap gap-3">
          {RULE_CHANNELS.map((channel) => (
            <label key={channel} className="flex items-center gap-1.5 text-sm capitalize">
              <input
                type="checkbox"
                checked={channels.has(channel)}
                onChange={() => toggleChannel(channel)}
                className="border-input size-4 rounded"
              />
              {channel}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rule-recipients">Recipients</Label>
        <Input
          id="rule-recipients"
          value={recipientsText}
          onChange={(event) => setRecipientsText(event.target.value)}
          placeholder="sales@company.com, +62812xxxxxxx"
        />
        <span className="text-muted-foreground text-xs">
          Comma-separated. Every recipient gets every selected channel — add an email address for Email, a phone
          number in E.164 format for WhatsApp.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Conditions (all must match)</Label>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <ConditionRowEditor
              key={row.key}
              row={row}
              metas={metas}
              fieldOrder={fieldOrder}
              onChange={(next) => updateRow(index, next)}
              onRemove={() => removeRow(index)}
              canRemove={rows.length > 1}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
          <Plus className="size-3.5" aria-hidden />
          Add condition
        </Button>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="mt-auto flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner className="size-3.5" />}
          {rule ? "Save changes" : "Create rule"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const AlertRuleTableRow = memo(function AlertRuleTableRow({
  rule,
  metas,
  busy,
  fireCount,
  onToggle,
  onDelete,
  onEdit,
}: {
  rule: AlertRuleRow;
  metas: FieldMetaMap;
  busy: boolean;
  /** Deliveries in the last 7 days — see `getAlertRuleFireCounts`. */
  fireCount: number;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const editableConditions = getEditableConditions(rule, metas);
  const editable = editableConditions !== null;
  const summary = describePredicate(rule.predicate as Predicate);

  return (
    <tr className="border-border border-t align-middle">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{rule.name}</span>
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            fired {fireCount}× this week
          </span>
        </div>
        {editableConditions && editableConditions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {editableConditions.map((condition, index) => {
              const meta = metas[condition.field as ConditionField];
              return meta.field === "leadType" && typeof condition.value === "string" ? (
                <IntentBadge key={index} intent={condition.value} />
              ) : (
                <span
                  key={index}
                  className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {conditionChipLabel(condition, meta)}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-muted-foreground max-w-md truncate text-xs" title={summary}>
            {summary}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {rule.channels.map((channel) => (
            <Badge key={channel} variant="outline" className="capitalize">
              {channel}
            </Badge>
          ))}
        </div>
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
        {!editable && (
          <div className="text-muted-foreground mt-1 text-[11px]">Custom logic</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          {editable && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
          )}
          <ConfirmDeleteDialog
            trigger={
              <Button size="icon" variant="outline" aria-label={`Delete ${rule.name}`} disabled={busy}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            }
            title={`Delete "${rule.name}"?`}
            description="Your team stops being notified by this rule immediately. This can't be undone."
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </td>
    </tr>
  );
});

export function AlertRuleManager({
  rules,
  propertyTypeOptions,
  locationOptions,
  fireCounts = {},
}: {
  rules: AlertRuleRow[];
  propertyTypeOptions: Option[];
  locationOptions: Option[];
  /** Rule id → deliveries in the last 7 days, from `getAlertRuleFireCounts`. */
  fireCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AlertRuleRow | null>(null);

  const fieldOrder = useMemo(
    () => buildFieldMetas(propertyTypeOptions, locationOptions),
    [propertyTypeOptions, locationOptions],
  );
  const metas = useMemo(
    () => Object.fromEntries(fieldOrder.map((m) => [m.field, m])) as FieldMetaMap,
    [fieldOrder],
  );

  const toggle = useCallback(
    async (rule: AlertRuleRow) => {
      await run(rule.id, () => setAlertRuleEnabled({ id: rule.id, enabled: !rule.enabled }), {
        errorFallback: "Could not update the alert rule",
        onSuccess: () => {
          toast.success(`${rule.name} is now ${rule.enabled ? "disabled" : "enabled"}`);
          router.refresh();
        },
      });
    },
    [run, router],
  );

  const remove = useCallback(
    async (rule: AlertRuleRow) => {
      await run(`delete-${rule.id}`, () => deleteAlertRule({ id: rule.id }), {
        errorFallback: "Could not delete the alert rule",
        onSuccess: () => {
          toast.success(`Deleted "${rule.name}"`);
          router.refresh();
        },
      });
    },
    [run, router],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" aria-hidden />
          New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No alert rules yet"
          description="Create a rule to notify your team by email or WhatsApp the moment a lead matches."
        />
      ) : (
        <DataTable minWidth="min-w-[860px]">
          <DataTableHead>
            <th>Rule</th>
            <th className="w-40">Channels</th>
            <th className="w-28">Status</th>
            <th className="w-48">Actions</th>
          </DataTableHead>
          <tbody>
            {rules.map((rule) => (
              <AlertRuleTableRow
                key={rule.id}
                rule={rule}
                metas={metas}
                busy={busyId === rule.id || busyId === `delete-${rule.id}`}
                fireCount={fireCounts[rule.id] ?? 0}
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
            <SheetTitle>New alert rule</SheetTitle>
            <SheetDescription>Notify your team the moment a lead matches every condition below.</SheetDescription>
          </SheetHeader>
          {creating && <AlertRuleForm metas={metas} fieldOrder={fieldOrder} onDone={() => setCreating(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit alert rule</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          {editing && (
            <AlertRuleForm rule={editing} metas={metas} fieldOrder={fieldOrder} onDone={() => setEditing(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
