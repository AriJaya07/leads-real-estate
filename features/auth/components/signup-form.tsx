"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/spinner";
import { FormError } from "@/features/auth/components/form-error";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { signUp } from "@/application/auth/signup.actions";
import { COMPANY_CATEGORIES, VERTICALS, type CompanyCategory } from "@/domain/verticals/catalog";
import { cn } from "@/lib/utils";

/**
 * Category is step 1, not a field alongside the rest — it's the one choice
 * that can't be changed later from any in-app UI (see `companies.category`'s
 * column comment: it silently picks the classifier lexicon that scores every
 * lead this company ever ingests), so it gets its own deliberate screen
 * instead of living at the bottom of a form someone tabs past.
 */
export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<"category" | "details">("category");
  const [category, setCategory] = useState<CompanyCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");

  function chooseCategory(next: CompanyCategory) {
    setCategory(next);
    setStep("details");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) {
      setStep("category");
      return;
    }
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await signUp({
      companyName: String(form.get("companyName") ?? ""),
      category,
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    setPending(false);

    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setError("Check your company name, email, and password.");
      return;
    }

    router.push("/leads");
    router.refresh();
  }

  if (step === "category") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">What kind of business is this?</h2>
          <p className="text-muted-foreground text-sm">
            Sets up the right fields, filters, and Apify actor suggestions for your industry. You can&apos;t change
            this later without contacting support.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMPANY_CATEGORIES.map((id) => {
            const vertical = VERTICALS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => chooseCategory(id)}
                className={cn(
                  "border-border hover:bg-accent/40 flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
                )}
              >
                <span className="text-sm font-medium">{vertical.label}</span>
                <span className="text-muted-foreground text-xs">{vertical.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Category: <span className="text-foreground font-medium">{category ? VERTICALS[category].label : ""}</span>
        </p>
        <button
          type="button"
          onClick={() => setStep("category")}
          className="text-brand text-xs font-medium hover:underline"
        >
          Change
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Agency name</Label>
        <Input
          id="companyName"
          name="companyName"
          type="text"
          required
          autoFocus
          placeholder="Bukit Villa Partners"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@agency.com"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 10 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Spinner className="size-4" />}
        Create workspace
      </Button>
    </form>
  );
}
