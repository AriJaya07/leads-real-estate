import * as React from "react"

import { cn } from "@/lib/utils"

/** Native `<select>` styled to match `Input`'s height/padding/type scale — the two should always move together. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-base",
        className
      )}
      {...props}
    />
  )
}

export { Select }
