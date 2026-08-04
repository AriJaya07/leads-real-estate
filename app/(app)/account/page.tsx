import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/application/auth/current-user";
import { getAcceptsAssignments, getProfile } from "@/application/auth/profile-queries";
import { getCompany } from "@/application/company/company-settings.actions";
import { roleAtLeast } from "@/domain/auth/permissions";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { AcceptsAssignmentsToggle } from "@/features/auth/components/accepts-assignments-toggle";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ProfileForm } from "@/features/auth/components/profile-form";
import { SignOutEverywhereButton } from "@/features/auth/components/sign-out-everywhere-button";
import { CompanySettingsForm } from "@/features/company/components/company-settings-form";

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

  const isAdmin = roleAtLeast(user.role, "admin");

  if (user.mustChangePassword) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Account" description={user.email} />
        <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-medium">Change password</h2>
          <ChangePasswordForm forced />
        </div>
      </div>
    );
  }

  const [profile, acceptsAssignments, company] = await Promise.all([
    getProfile(user.userId),
    getAcceptsAssignments(user.userId),
    isAdmin ? getCompany(user.companyId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Account" description={user.email} />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="profile">Profile</TabsTab>
          {isAdmin && <TabsTab value="company">Company</TabsTab>}
          <TabsTab value="security">Security</TabsTab>
        </TabsList>

        <TabsPanel value="profile" className="flex flex-col gap-6">
          <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-medium">Profile</h2>
            <ProfileForm profile={profile} />
          </div>
          <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-medium">Lead assignment</h2>
            <AcceptsAssignmentsToggle initialValue={acceptsAssignments} />
          </div>
        </TabsPanel>

        {isAdmin && company && (
          <TabsPanel value="company">
            <CompanySettingsForm
              companyId={company.id}
              companyName={company.name}
              canDelete={user.role === "owner"}
            />
          </TabsPanel>
        )}

        <TabsPanel value="security" className="flex flex-col gap-6">
          <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-medium">Change password</h2>
            <ChangePasswordForm forced={false} />
          </div>
          <div className="border-border max-w-md rounded-xl border p-4 sm:p-6">
            <h2 className="mb-1 text-sm font-medium">Sessions</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              Signs this account out everywhere — every browser and device currently signed in, including this
              one.
            </p>
            <SignOutEverywhereButton />
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
