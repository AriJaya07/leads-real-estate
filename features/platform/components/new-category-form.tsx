"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { createCategory } from "@/application/categories/categories.actions";

/**
 * Instant category creation — no code or migration, see
 * `docs/platform-super-admin-flow.md` §3 (revised). Defaults `status` to
 * `beta` so a brand-new category never shows on `/signup` before a Super
 * Admin has had a chance to add lexicon phrases on its detail page and
 * flip it to `active` deliberately.
 */
export function NewCategoryForm() {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [categoryField, setCategoryField] = useState("");
  const [wants, setWants] = useState("");
  const [budget, setBudget] = useState("Budget");
  const [locations, setLocations] = useState("Locations");
  const [companyName, setCompanyName] = useState("Company name");
  const [companyNamePlaceholder, setCompanyNamePlaceholder] = useState("");
  const busy = busyId === "new-category";

  if (!showForm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="self-start">
        <Plus className="size-3.5" aria-hidden />
        New category
      </Button>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await run(
      "new-category",
      () =>
        createCategory({
          slug,
          label,
          description,
          fieldLabels: { categoryField, wants, budget, locations, companyName, companyNamePlaceholder },
          status: "beta",
        }),
      {
        errorFallback: "Could not create category",
        onSuccess: () => {
          toast.success(`Created "${label}" — add lexicon phrases before switching it to active`);
        },
      },
    );
    if (data?.slug) router.push(`/platform/categories/${data.slug}`);
  }

  return (
    <form onSubmit={submit} className="border-border flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-label">Label</Label>
          <Input id="cat-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Automotive" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-slug">Slug</Label>
          <Input
            id="cat-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="automotive"
            pattern="^[a-z][a-z0-9_]*$"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cat-description">Description (shown on the signup picker)</Label>
        <Input
          id="cat-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cars, dealers, and listings — buyers, sellers, and dealers."
          required
        />
      </div>

      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Field labels</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-category-field">Category field</Label>
          <Input id="cat-category-field" value={categoryField} onChange={(e) => setCategoryField(e.target.value)} placeholder="Vehicle types" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-wants">Wants</Label>
          <Input id="cat-wants" value={wants} onChange={(e) => setWants(e.target.value)} placeholder="Vehicle interests" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-budget">Budget</Label>
          <Input id="cat-budget" value={budget} onChange={(e) => setBudget(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-locations">Locations</Label>
          <Input id="cat-locations" value={locations} onChange={(e) => setLocations(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-company-name">Company name field</Label>
          <Input id="cat-company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-company-placeholder">Company name placeholder</Label>
          <Input
            id="cat-company-placeholder"
            value={companyNamePlaceholder}
            onChange={(e) => setCompanyNamePlaceholder(e.target.value)}
            placeholder="Bali Motors Group"
            required
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Created as <span className="font-medium">Beta</span> — hidden from `/signup` until you add lexicon phrases on
        its detail page and switch it to Active.
      </p>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner className="size-3.5" />}
          Create category
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
