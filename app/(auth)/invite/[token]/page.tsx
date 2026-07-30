import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getInviteByToken } from "@/application/auth/invite.actions";
import { AcceptInviteForm } from "@/features/auth/components/accept-invite-form";
import { BrandMark } from "@/components/brand/brand-mark";

export const metadata: Metadata = { title: "Accept invite" };

async function InviteContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark className="size-11" />
        {invite ? (
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Join {invite.companyName}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Set a password for {invite.email} to finish joining as {invite.role}.
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Invite not found</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              This link is invalid, already used, or has expired. Ask whoever invited you to send a new one.
            </p>
          </div>
        )}
      </div>

      {invite ? (
        <AcceptInviteForm token={token} />
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      )}
    </>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main id="main-content" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Suspense fallback={<BrandMark className="mx-auto size-11" />}>
          <InviteContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}
