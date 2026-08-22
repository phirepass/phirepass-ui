import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
    "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 ease-mac data-[state=checked]:bg-accent data-[state=checked]:bg-[image:var(--fill-accent)] data-[state=unchecked]:bg-white/[0.08] data-[state=unchecked]:shadow-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-40",
    className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
    className={cn(
        "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-thumb ring-0 transition-transform duration-200 ease-mac data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
    )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
