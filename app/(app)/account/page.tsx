import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/application/auth/current-user";
import { getProfile } from "@/application/auth/profile-queries";
import { PageHeader } from "@/components/common/page-header";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ProfileForm } from "@/features/auth/components/profile-form";
import { SignOutEverywhereButton } from "@/features/auth/components/sign-out-everywhere-button";

export const metadata: Metadata = { title: "Account" };

/**
 * Deliberately calls `currentUser()` directly rather than `requireUser()` —
 * `requireUser()` redirects here whenever `mustChangePassword` is set, which
 * is exactly the state this page exists to resolve. Redirecting from here too
 * would loop.
 */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Account"
        description={user.email}
      />

      {!user.mustChangePassword && (
        <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-medium">Profile</h2>
          <ProfileForm profile={await getProfile(user.userId)} />
        </div>
      )}

      <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-medium">Change password</h2>
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>

      {!user.mustChangePassword && (
        <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
          <h2 className="mb-1 text-sm font-medium">Sessions</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Signs this account out everywhere — every browser and device currently signed in,
            including this one.
          </p>
          <SignOutEverywhereButton />
        </div>
      )}
    </div>
  );
}
