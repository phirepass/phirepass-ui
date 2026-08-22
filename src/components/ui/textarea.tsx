import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
    className={cn(
        "flex min-h-[80px] w-full rounded-md border border-hairline bg-input/80 px-3 py-2 text-sm shadow-sunken transition-[box-shadow,border-color] duration-150 ease-mac mac-squircle placeholder:text-muted-foreground focus-visible:border-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-40",
        className,
    )}
    ref={ref}
    {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
