"use client";

import { useState } from "react";
import { Bookmark, GripVertical } from "lucide-react";
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

/** MIME type used for the dragged lead id — arbitrary but namespaced against accidental drops from elsewhere. */
const DRAG_MIME = "application/x-dreamrue-lead-id";

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
        "border-border bg-card flex cursor-grab flex-col gap-2 rounded-lg border p-2.5 text-sm active:cursor-grabbing",
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

      <div>
        <p className="truncate font-medium">{lead.name ?? "Unknown"}</p>
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {lead.primaryAppearance?.body || "(no text)"}
        </p>
      </div>

      <span className="text-muted-foreground text-xs">
        <RelativeTime value={lead.latestAppearanceAt} />
      </span>

      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground w-14 shrink-0">Status</span>
          <select
            aria-label={`Status for ${lead.name ?? "lead"}`}
            value={lead.status}
            disabled={busy}
            onChange={(event) => onChangeStatus(lead.id, event.target.value as LeadStatusValue)}
            className="border-input bg-background min-w-0 flex-1 rounded border px-1.5 py-1 text-xs"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {leadStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
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
      </div>
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
  muted = false,
}: {
  status: LeadStatusValue;
  datasetId: string | undefined;
  teamMembers: TeamMember[];
  muted?: boolean;
}) {
  const { busyId, run } = useServerAction();
  const [isDropTarget, setIsDropTarget] = useState(false);

  const filters = { ...DEFAULT_FILTERS, datasetId, status: [status], sort: "priority" as const, pageSize: 50 };
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
        "bg-muted/30 flex w-64 shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors",
        isDropTarget && "bg-accent ring-brand/50 ring-2",
        muted && "w-52 opacity-80",
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
 */
export function PipelineBoard({ teamMembers }: { teamMembers: TeamMember[] }) {
  const { searchParams } = useUrlFilters();
  const datasetId = searchParams.get("datasetId") ?? undefined;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_STATUSES.map((status) => (
        <PipelineColumn key={status} status={status} datasetId={datasetId} teamMembers={teamMembers} />
      ))}
      <div className="border-border/60 mx-1 w-px shrink-0 self-stretch border-l" aria-hidden />
      {TERMINAL_STATUSES.map((status) => (
        <PipelineColumn
          key={status}
          status={status}
          datasetId={datasetId}
          teamMembers={teamMembers}
          muted
        />
      ))}
    </div>
  );
}

