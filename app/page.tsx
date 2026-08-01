import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/application/auth/current-user";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import { Homepage } from "@/components/marketing/homepage";

/**
 * The session check is per-request data, so under Cache Components it has to
 * sit inside its own `Suspense` boundary (same reasoning as
 * `app/(app)/layout.tsx`'s `DatasetSwitcherSlot`) — otherwise it blocks the
 * whole marketing homepage from prerendering. Renders nothing itself; a
 * signed-in visitor is redirected to `/leads` once it resolves.
 */
async function AuthRedirect() {
  const user = await currentUser();
  if (user) redirect("/leads");
  return null;
}

/** Signed-in visitors land in the inbox; signed-out visitors see the marketing homepage. */
export default function RootPage() {
  return (
    <MarketingChrome>
      <Suspense fallback={null}>
        <AuthRedirect />
      </Suspense>
      <Homepage />
    </MarketingChrome>
  );
}
