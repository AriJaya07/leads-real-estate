"use client";

import { useState } from "react";
import { Bookmark, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/common/score-badge";
import { IntentBadge } from "@/components/common/intent-badge";
import { RelativeTime } from "@/components/common/relative-time";
import { Spinner } from "@/components/common/spinner";
import { useLeadsQuery } from "@/features/leads/queries";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useServerAction } from "@/hooks/use-server-action";
import { assignLead, setLeadStatus, toggleBookmark } from "@/application/leads/lead.actions";
import {
  LEAD_STATUSES,
  PIPELINE_STATUSES,
  TERMINAL_STATUSES,
  leadStatusLabel,
} from "@/application/leads/lead-status";
import { DEFAULT_FILTERS } from "@/application/leads/filters.schema";
import type { LeadListItem } from "@/application/leads/lead-queries";
import { primaryLeadScore } from "@/domain/lead/ranking";
import type { LeadStatusValue } from "@/application/leads/sql-helpers";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

const ALL_STATUSES = [...PIPELINE_STATUSES, ...TERMINAL_STATUSES] satisfies readonly LeadStatusValue[];

/** MIME type used for the dragged lead id — arbitrary but namespaced against accidental drops from elsewhere. */
const DRAG_MIME = "application/x-dreamrue-lead-id";

/**
 * A "new" lead ages toward being missed the longer it sits untouched — everywhere
 * else on the board, elapsed time is just reference, not urgency, so it stays neutral.
 * Reuses the same warn/bad tokens `ScoreBadge`/`HealthPill` use for their tone scale.
 */
function timeToneClassName(status: string, latestAppearanceAt: Date | null): string {
  if (status !== "new" || !latestAppearanceAt) return "text-muted-foreground";
  const hours = (Date.now() - new Date(latestAppearanceAt).getTime()) / 3_600_000;
  if (hours >= 4) return "text-[var(--health-bad-fg)]";
  if (hours >= 1) return "text-[var(--health-warn-fg)]";
  return "text-muted-foreground";
}

function PipelineCard({
  lead,
  teamMembers,
  busy,
  onChangeStatus,
  onAssign,
  onToggleBookmark,
}: {
  lead: LeadListItem;
  teamMembers: TeamMember[];
  busy: boolean;
  onChangeStatus: (leadId: string, status: LeadStatusValue) => void;
  onAssign: (leadId: string, userId: string | null) => void;
  onToggleBookmark: (leadId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_MIME, lead.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "border-border bg-card flex cursor-grab flex-col gap-2 rounded-lg border p-2.5 text-sm transition-opacity motion-reduce:transition-none active:cursor-grabbing",
        busy && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <GripVertical className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <ScoreBadge score={primaryLeadScore(lead)} />
          <IntentBadge intent={lead.leadType} />
        </div>
        <button
          type="button"
          aria-label={lead.bookmarked ? "Remove bookmark" : "Bookmark"}
          aria-pressed={lead.bookmarked}
          disabled={busy}
          onClick={() => onToggleBookmark(lead.id)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <Bookmark className={cn("size-3.5", lead.bookmarked && "fill-current text-brand")} aria-hidden />
        </button>
      </div>

      <div className="min-w-0">
        <p className="truncate font-medium">{lead.name ?? "Unknown"}</p>
        <p className="text-muted-foreground truncate text-xs">
          {lead.locations.length ? lead.locations.join(", ") : "Any location"}
        </p>
      </div>

      {/* The drag above is the fast path; this select is the a11y fallback that
          works with a keyboard or screen reader alone — every card carries one. */}
      <div className="border-border/60 flex items-center justify-between gap-2 border-t pt-2">
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            timeToneClassName(lead.status, lead.latestAppearanceAt),
          )}
        >
          <RelativeTime value={lead.latestAppearanceAt} />
        </span>
        <label className="text-muted-foreground flex items-center gap-1 text-xs">
          Move
          <select
            aria-label={`Status for ${lead.name ?? "lead"}`}
            value={lead.status}
            disabled={busy}
            onChange={(event) => onChangeStatus(lead.id, event.target.value as LeadStatusValue)}
            className="border-input bg-background rounded border px-1 py-0.5 text-xs"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {leadStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground w-14 shrink-0">Assignee</span>
        <select
          aria-label={`Assignee for ${lead.name ?? "lead"}`}
          value={lead.assignedTo ?? ""}
          disabled={busy}
          onChange={(event) => onAssign(lead.id, event.target.value || null)}
          className="border-input bg-background min-w-0 flex-1 rounded border px-1.5 py-1 text-xs"
        >
          <option value="">Unassigned</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
      </label>

      {busy && (
        <div className="flex justify-center">
          <Spinner className="size-3.5" />
        </div>
      )}
    </div>
  );
}

function PipelineColumn({
  status,
  datasetId,
  teamMembers,
  assignedTo,
  muted = false,
  fullWidth = false,
}: {
  status: LeadStatusValue;
  datasetId: string | undefined;
  teamMembers: TeamMember[];
  /** From the board's "My leads" toggle / agent picker — filters every column identically. */
  assignedTo?: string;
  muted?: boolean;
  /** The single-column mobile layout — full width instead of the fixed desktop column width. */
  fullWidth?: boolean;
}) {
  const { busyId, run } = useServerAction();
  const [isDropTarget, setIsDropTarget] = useState(false);

  const filters = {
    ...DEFAULT_FILTERS,
    datasetId,
    status: [status],
    sort: "priority" as const,
    pageSize: 50,
    ...(assignedTo ? { assignedTo } : {}),
  };
  const { data: page, isFetching } = useLeadsQuery(filters);

  function changeStatus(leadId: string, next: LeadStatusValue) {
    void run(leadId, () => setLeadStatus({ leadId, status: next }), {
      errorFallback: "Could not change status",
      invalidateKeys: [["leads"]],
    });
  }

  function assign(leadId: string, userId: string | null) {
    void run(leadId, () => assignLead({ leadId, userId }), {
      errorFallback: "Could not assign lead",
      invalidateKeys: [["leads"]],
    });
  }

  function bookmark(leadId: string) {
    void run(leadId, () => toggleBookmark({ leadId }), {
      errorFallback: "Could not update bookmark",
      invalidateKeys: [["leads"]],
    });
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDropTarget(false);
        const leadId = event.dataTransfer.getData(DRAG_MIME);
        if (leadId) changeStatus(leadId, status);
      }}
      className={cn(
        "bg-muted/30 flex shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors motion-reduce:transition-none",
        fullWidth ? "w-full" : "w-64",
        isDropTarget && "bg-accent ring-brand/50 ring-2",
        muted && (fullWidth ? "opacity-80" : "w-52 opacity-80"),
      )}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold capitalize">{leadStatusLabel(status)}</h3>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {page ? page.total : isFetching ? "…" : 0}
        </span>
      </div>

      <div className="flex min-h-16 flex-col gap-2">
        {page?.items.length === 0 && (
          <p className="text-muted-foreground px-1 text-xs">No leads</p>
        )}
        {page?.items.map((lead) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            teamMembers={teamMembers}
            busy={busyId === lead.id}
            onChangeStatus={changeStatus}
            onAssign={assign}
            onToggleBookmark={bookmark}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Every column is `useLeadsQuery` with a different `status` filter — the
 * pipeline board is a view over the same query the inbox uses, not a
 * parallel data path. A status change (drag-drop or the keyboard-accessible
 * select) invalidates the shared `["leads"]` cache, which refetches every
 * column at once since they all share that key prefix.
 *
 * "My leads" / the agent picker both drive the existing `assignedTo` lead
 * filter (already used by the main inbox's filter bar) through the URL, so
 * the scope is shareable and survives a refresh like every other filter here.
 */
export function PipelineBoard({
  teamMembers,
  currentUserId,
}: {
  teamMembers: TeamMember[];
  currentUserId: string;
}) {
  const { searchParams, setParams } = useUrlFilters();
  const datasetId = searchParams.get("datasetId") ?? undefined;
  const assignedToParam = searchParams.get("assignedTo") ?? "";
  const [activeStatus, setActiveStatus] = useState<LeadStatusValue>(PIPELINE_STATUSES[0]);

  function setAssignedTo(value: string) {
    setParams((next) => {
      if (value) next.set("assignedTo", value);
      else next.delete("assignedTo");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={assignedToParam === currentUserId ? "secondary" : "outline"}
          size="sm"
          aria-pressed={assignedToParam === currentUserId}
          onClick={() => setAssignedTo(assignedToParam === currentUserId ? "" : currentUserId)}
        >
          My leads
        </Button>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filter by agent</span>
          <select
            aria-label="Filter by agent"
            value={assignedToParam === currentUserId ? "" : assignedToParam}
            onChange={(event) => setAssignedTo(event.target.value)}
            className="border-input bg-background rounded-md border px-2.5 py-1.5 text-xs"
          >
            <option value="">All agents</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Below md, a six-column board scrolled sideways doesn't work — one
          column at a time behind a status tab strip instead. */}
      <div className="flex flex-col gap-2 md:hidden">
        <div role="tablist" aria-label="Pipeline status" className="flex gap-1 overflow-x-auto pb-1">
          {ALL_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={activeStatus === status}
              onClick={() => setActiveStatus(status)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors motion-reduce:transition-none",
                activeStatus === status
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {leadStatusLabel(status)}
            </button>
          ))}
        </div>
        <PipelineColumn
          status={activeStatus}
          datasetId={datasetId}
          teamMembers={teamMembers}
          assignedTo={assignedToParam || undefined}
          fullWidth
        />
      </div>

      {/* md and up: the full six-column board, side by side. */}
      <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
        {PIPELINE_STATUSES.map((status) => (
          <PipelineColumn
            key={status}
            status={status}
            datasetId={datasetId}
            teamMembers={teamMembers}
            assignedTo={assignedToParam || undefined}
          />
        ))}
        <div className="border-border/60 mx-1 w-px shrink-0 self-stretch border-l" aria-hidden />
        {TERMINAL_STATUSES.map((status) => (
          <PipelineColumn
            key={status}
            status={status}
            datasetId={datasetId}
            teamMembers={teamMembers}
            assignedTo={assignedToParam || undefined}
            muted
          />
        ))}
      </div>
    </div>
  );
}
