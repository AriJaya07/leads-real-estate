"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/common/spinner";
import { updateProfile } from "@/application/auth/profile.actions";
import type { Profile } from "@/application/auth/profile-queries";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await updateProfile({
      phone: String(form.get("phone") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      jobTitle: String(form.get("jobTitle") ?? ""),
      bio: String(form.get("bio") ?? ""),
    });

    setPending(false);

    if (result?.serverError || result?.validationErrors) {
      toast.error(result?.serverError ?? "Could not save your profile");
      return;
    }

    toast.success("Profile saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="jobTitle">Job title</Label>
        <Input id="jobTitle" name="jobTitle" defaultValue={profile.jobTitle ?? ""} placeholder="Optional" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={profile.phone ?? ""} placeholder="Optional" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue={profile.timezone} placeholder="Asia/Makassar" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} rows={3} placeholder="Optional" />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Spinner className="size-4" />}
        Save profile
      </Button>
    </form>
  );
}
