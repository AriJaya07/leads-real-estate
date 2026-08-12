"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { extendTenantTrial, resendTenantInvite } from "@/application/platform/tenant-actions";
import { TRIAL_DAYS } from "@/shared/constants";
import type { PendingInvite } from "@/application/platform/tenant-detail.queries";

/**
 * The only two writes this whole page is allowed to make — see
 * `application/platform/tenant-actions.ts`'s comment. Deliberately not a
 * generic "edit tenant" form: each button here is one specific, logged,
 * reversible action, matching the design note that a Super Admin's writes
 * must never be able to touch a lead, a dataset, or a rule.
 */
export function ExtendTrialButton({ companyId, canExtend }: { companyId: string; canExtend: boolean }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const busy = busyId === "extend-trial";

  if (!canExtend) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() =>
        run("extend-trial", () => extendTenantTrial({ companyId, days: TRIAL_DAYS }), {
          errorFallback: "Could not extend the trial",
          onSuccess: () => {
            toast.success(`Trial extended ${TRIAL_DAYS} days`);
            router.refresh();
          },
        })
      }
    >
      {busy && <Spinner className="size-3.5" />}
      Extend trial {TRIAL_DAYS}d
    </Button>
  );
}

export function ResendInviteButton({ invite }: { invite: PendingInvite }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const busy = busyId === invite.id;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() =>
        run(invite.id, () => resendTenantInvite({ inviteId: invite.id }), {
          errorFallback: "Could not resend the invite",
          onSuccess: (data) => {
            toast.success(data?.emailSent ? `Invite resent to ${invite.email}` : `New link ready for ${invite.email} — email not configured, share it manually`);
            router.refresh();
          },
        })
      }
    >
      {busy && <Spinner className="size-3.5" />}
      Resend invite
    </Button>
  );
}
