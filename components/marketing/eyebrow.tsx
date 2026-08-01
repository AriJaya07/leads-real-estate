import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-accent-warm font-serif text-xs font-medium tracking-[0.2em] uppercase italic",
        className,
      )}
    >
      {children}
    </span>
  );
}
