import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
    <input
        type={type}
        className={cn(
        "flex h-10 w-full rounded-md border border-hairline bg-input/80 px-3 py-2 text-base shadow-sunken transition-[box-shadow,border-color] duration-150 ease-mac mac-squircle file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-40 md:text-sm",
        className,
        )}
        ref={ref}
        {...props}
    />
    );
  },
);
Input.displayName = "Input";

export { Input };
