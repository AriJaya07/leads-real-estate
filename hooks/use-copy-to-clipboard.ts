"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const RESET_DELAY_MS = 1500;

/** `copied` flips back to `false` on its own after `RESET_DELAY_MS` — swap an icon/label off it. */
export function useCopyToClipboard(): { copied: boolean; copy: (value: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), RESET_DELAY_MS);
  }, []);

  return { copied, copy };
}
