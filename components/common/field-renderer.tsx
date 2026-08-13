"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActorParamField } from "@/domain/collection/actor-request";

/**
 * One field renderer (label + input by `field.type`), reused everywhere a
 * template's `paramSchema` needs to become a form: `RequestScrapeForm`'s
 * "Configure filters" step today, the actor-template admin editor tomorrow.
 * A new field type is added once, here — see
 * "AveronAI - Apify + N8N Architecture.md" §3.2's field-renderer rule.
 */
export function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ActorParamField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.key}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
      </Label>
      <FieldInput field={field} id={id} value={value} onChange={onChange} />
      {field.helpText && <p className="text-muted-foreground text-xs">{field.helpText}</p>}
    </div>
  );
}

function FieldInput({
  field,
  id,
  value,
  onChange,
}: {
  field: ActorParamField;
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          required={field.required}
        />
      );
    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "url":
      return (
        <Input
          id={id}
          type="url"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "select":
      return (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
        >
          <option value="">Select…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
          {field.options?.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange(active ? selected.filter((v) => v !== option.value) : [...selected, option.value])
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-accent/40",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "tags":
      return (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? "One per line, or comma-separated"}
          rows={3}
          required={field.required}
        />
      );
    case "text":
    default:
      return (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
  }
}
