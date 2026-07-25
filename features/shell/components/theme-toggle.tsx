"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The resolved theme is unknown during SSR — next-themes only learns it on the
 * client — so nothing rendered here may depend on it. The label stays constant
 * and the icons swap through the `dark:` class that next-themes puts on <html>,
 * which is CSS rather than markup and so cannot mismatch.
 *
 * `resolvedTheme` is read inside the click handler instead, where it is known.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle light and dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </Button>
  );
}
