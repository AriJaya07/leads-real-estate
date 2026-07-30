"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setAcceptsAssignments } from "@/application/auth/profile.actions";
import { useServerAction } from "@/hooks/use-server-action";

/** Self-service opt-out of the automatic lead-assignment round-robin — e.g. while on leave. */
export function AcceptsAssignmentsToggle({ initialValue }: { initialValue: boolean }) {
  const { busyId, run } = useServerAction();
  const [checked, setChecked] = useState(initialValue);
  const busy = busyId === "accepts-assignments";

  async function toggle(next: boolean) {
    await run("accepts-assignments", () => setAcceptsAssignments({ acceptsAssignments: next }), {
      errorFallback: "Could not update your assignment preference",
      onSuccess: () => {
        setChecked(next);
        toast.success(next ? "You're back in the assignment rotation" : "You're paused from new automatic assignments");
      },
    });
  }

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(event) => void toggle(event.target.checked)}
        className="border-input mt-0.5 size-4 rounded"
      />
      <span>
        <span className="font-medium">Receive automatically-assigned leads</span>
        <p className="text-muted-foreground text-sm">
          When your company has automatic lead assignment turned on, new unassigned leads round-robin across
          everyone with this checked. Uncheck it while you&rsquo;re away.
        </p>
      </span>
    </label>
  );
}
