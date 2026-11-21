import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
    "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 ease-mac data-[state=checked]:bg-accent data-[state=checked]:bg-[image:var(--fill-accent)] data-[state=unchecked]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-40",
    className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
    className={cn(
        "pointer-events-none block h-[14px] w-[14px] rounded-full bg-white shadow-thumb ring-0 transition-transform duration-200 ease-mac data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
    )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
