"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteCompany, updateCompanyName } from "@/application/company/company-settings.actions";

export function CompanySettingsForm({
  companyId,
  companyName,
  canDelete,
}: {
  companyId: string;
  companyName: string;
  /** Only the owner can destroy the workspace — everyone admin+ can rename it. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(companyName);
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await updateCompanyName({ name: name.trim() });
    setSaving(false);
    if (!result?.data) {
      toast.error(result?.serverError ?? "Could not save the company name");
      return;
    }
    toast.success("Company name saved");
    router.refresh();
  }

  async function destroy() {
    setDeleting(true);
    const result = await deleteCompany({ confirmName: confirmText });
    setDeleting(false);
    if (!result?.data) {
      toast.error(result?.serverError ?? "Could not delete the workspace");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
      <form onSubmit={save} className="border-border flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
        <h2 className="text-sm font-medium">Company</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${companyId}-name`}>Company name</Label>
          <Input id={`${companyId}-name`} value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <Button type="submit" disabled={saving || name.trim() === companyName} className="w-fit">
          {saving && <Spinner className="size-3.5" />}
          Save changes
        </Button>
      </form>

      {canDelete && (
        <div className="border-destructive/30 flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
          <h2 className="text-destructive text-sm font-medium">Danger zone</h2>
          <p className="text-muted-foreground text-sm">
            Deleting the workspace removes every lead, dataset and run permanently. This is the one place in
            DreamRue where data is actually destroyed — it cannot be undone, and only the owner can do it.
          </p>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" className="w-fit" />}>
              Delete workspace
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &ldquo;{companyName}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes every lead, dataset, sync run and team member in this workspace. Type the
                  company name to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={companyName}
                autoComplete="off"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={confirmText !== companyName || deleting} onClick={() => void destroy()}>
                  {deleting && <Spinner className="size-3.5" />}
                  Delete workspace
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
