"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/spinner";
import { acceptSchemaVersion, approveMappingProfile } from "@/application/datasets/dataset.actions";
import { useServerAction } from "@/hooks/use-server-action";
import { datasetsQueryKey } from "@/features/datasets/query-keys";

/**
 * A drifted schema version stays flagged until a human confirms the mapping
 * still holds — see the comment on `acceptSchemaVersion` in
 * `application/datasets/dataset.actions.ts`. This button is the human.
 */
export function AcceptSchemaVersionButton({
  versionId,
  datasetId,
}: {
  versionId: string;
  datasetId: string;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busyId === versionId}
      onClick={() =>
        void run(versionId, () => acceptSchemaVersion({ versionId, datasetId }), {
          errorFallback: "Could not accept this schema version",
          invalidateKeys: [datasetsQueryKey],
          onSuccess: () => {
            toast.success("Schema version accepted");
            router.refresh();
          },
        })
      }
    >
      {busyId === versionId ? (
        <Spinner className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" aria-hidden />
      )}
      Accept
    </Button>
  );
}

/** A curated profile always wins, but a low-confidence auto-proposal waits here until reviewed. */
export function ApproveMappingProfileButton({
  profileId,
  datasetId,
}: {
  profileId: string;
  datasetId: string;
}) {
  const router = useRouter();
  const { busyId, run } = useServerAction();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busyId === profileId}
      onClick={() =>
        void run(profileId, () => approveMappingProfile({ profileId, datasetId }), {
          errorFallback: "Could not approve this mapping profile",
          onSuccess: () => {
            toast.success("Mapping profile approved");
            router.refresh();
          },
        })
      }
    >
      {busyId === profileId ? (
        <Spinner className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" aria-hidden />
      )}
      Approve
    </Button>
  );
}
