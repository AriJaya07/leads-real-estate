"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/common/spinner";
import { useServerAction } from "@/hooks/use-server-action";
import { addLexiconPhrase, removeLexiconPhrase } from "@/application/categories/categories.actions";
import type { LexiconPhraseRow } from "@/application/categories/categories.queries";

const INTENTS = ["buyer", "seller", "agent", "investor", "broker"] as const;

/**
 * The scoring-safety-net tradeoff `docs/platform-super-admin-flow.md` §3.0
 * accepted by going fully dynamic — weight bounded 5-50 at the action layer
 * (`application/categories/categories.actions.ts`), same scale the old
 * hand-authored lexicon files used, but no code review gate anymore. Logged
 * as its own `update_lexicon` action, separate from `update_config`.
 */
export function LexiconPhraseEditor({ categoryId, phrases }: { categoryId: string; phrases: LexiconPhraseRow[] }) {
  const router = useRouter();
  const { busyId, run } = useServerAction();
  const [intent, setIntent] = useState<(typeof INTENTS)[number]>("buyer");
  const [phrase, setPhrase] = useState("");
  const [weight, setWeight] = useState("25");
  const [lang, setLang] = useState<"en" | "id">("en");
  const busy = busyId === "add-phrase";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      "add-phrase",
      () => addLexiconPhrase({ categoryId, intent, phrase, weight: Number(weight), lang }),
      {
        errorFallback: "Could not add phrase",
        onSuccess: () => {
          toast.success(`Added "${phrase}"`);
          setPhrase("");
          router.refresh();
        },
      },
    );
  }

  async function remove(id: string) {
    await run(id, () => removeLexiconPhrase({ id, categoryId }), {
      errorFallback: "Could not remove phrase",
      onSuccess: () => {
        toast.success("Phrase removed");
        router.refresh();
      },
    });
  }

  return (
    <div className="border-border flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <h3 className="text-sm font-semibold">Intent lexicon</h3>
        <p className="text-muted-foreground text-xs">
          Weighted phrases that classify a lead&apos;s stated intent — the DB-driven replacement for the old hand-authored
          lexicon files. Weight scale roughly 10-45; bounded 5-50.
        </p>
      </div>

      {INTENTS.map((i) => {
        const rows = phrases.filter((p) => p.intent === i);
        if (rows.length === 0) return null;
        return (
          <div key={i} className="flex flex-col gap-1.5">
            <Badge variant="outline" className="w-fit capitalize">
              {i}
            </Badge>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {rows.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="flex-1">{p.phrase}</span>
                  <span className="text-muted-foreground font-mono text-xs">{p.lang}</span>
                  <span className="font-mono text-xs tabular-nums">{p.weight}</span>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={busyId === p.id}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove "${p.phrase}"`}
                  >
                    {busyId === p.id ? <Spinner className="size-3.5" /> : <X className="size-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {phrases.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No phrases yet — this category falls back to the real-estate lexicon until you add some.
        </p>
      )}

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[110px_1fr_80px_70px_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phrase-intent">Intent</Label>
          <Select
            id="phrase-intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value as typeof intent)}
            className="capitalize"
          >
            {INTENTS.map((i) => (
              <option key={i} value={i} className="capitalize">
                {i}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phrase-text">Phrase</Label>
          <Input id="phrase-text" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="looking to buy" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phrase-weight">Weight</Label>
          <Input id="phrase-weight" type="number" min={5} max={50} value={weight} onChange={(e) => setWeight(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phrase-lang">Lang</Label>
          <Select id="phrase-lang" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            <option value="en">en</option>
            <option value="id">id</option>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner className="size-3.5" />}
          Add
        </Button>
      </form>
    </div>
  );
}
