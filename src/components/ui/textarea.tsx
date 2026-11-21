import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
    className={cn(
        "flex min-h-[80px] w-full rounded-md border border-hairline bg-input px-3 py-2 text-sm transition-[box-shadow,border-color] duration-150 ease-mac placeholder:text-muted-foreground focus-visible:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-40",
        className,
    )}
    ref={ref}
    {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
