import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  // Portalled to the body. Rendered inline, the content is positioned against
  // the nearest containing block rather than the viewport — and any ancestor
  // with `container-type` (Tailwind's `@container`), a transform, or `contain`
  // becomes one, which lands the tooltip nowhere near its trigger. Cards using
  // `@container` hit exactly that.
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    collisionPadding={8}
    className={cn(
    // z-[1300] rather than shadcn's z-50: portalling puts this a sibling of
    // the dialog layer (z-[1200]/[1201] in dialog.tsx), not a child of it, so
    // z-50 would hide every tooltip inside a dialog. Matches select.tsx.
    "z-[1300] overflow-hidden rounded-[8px] border border-hairline bg-[image:var(--fill-menu)] px-2.5 py-1.5 text-[12px] text-popover-foreground shadow-menu mac-material-hud mac-squircle duration-150 ease-mac animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
    )}
    {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
