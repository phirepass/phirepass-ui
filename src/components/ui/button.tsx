import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * macOS push buttons.
 *
 * Three things separate one from a coloured rectangle, and every variant below
 * has all three: a vertical fill that is brighter at the top (`--fill-*`), a
 * specular highlight along the top edge plus a tight contact shadow
 * (`shadow-control`), and a press state that sinks the surface inward
 * (`shadow-control-pressed`) instead of shrinking it. macOS controls do not
 * scale under the pointer — they darken and recess — so nothing here uses
 * `active:scale`.
 *
 * `default` stays near-white rather than taking the emerald accent: that green
 * already means "online" on every node card, and a CTA wearing it would compete
 * with status. Emerald is available as `accent` for the rare case that wants it.
 *
 * The size scale is unchanged from before the restyle — the `md:` steps exist
 * to keep touch targets large on phones and tighten them on the desktop, and
 * only the radii moved.
 */
const buttonVariants = cva(
    [
        "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
        "text-sm font-medium tracking-[-0.01em] mac-squircle",
        "transition-[background-image,background-color,box-shadow,color,filter,border-color] duration-150 ease-mac",
        // The macOS focus ring: a soft accent halo hugging the control's own
        // shape, rather than an offset outline floating away from it.
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    ],
    {
        variants: {
            variant: {
                default:
                    "bg-primary bg-[image:var(--fill-prominent)] text-primary-foreground shadow-control hover:bg-[image:var(--fill-prominent-hover)] active:brightness-95 active:shadow-control-pressed",
                destructive:
                    "bg-destructive bg-[image:var(--fill-destructive)] text-destructive-foreground shadow-control hover:bg-[image:var(--fill-destructive-hover)] active:brightness-95 active:shadow-control-pressed",
                accent:
                    "bg-accent bg-[image:var(--fill-accent)] text-accent-foreground shadow-control hover:bg-[image:var(--fill-accent-hover)] active:brightness-95 active:shadow-control-pressed",
                // The standard macOS push button: a translucent control fill
                // over whatever it sits on, edged with a hairline.
                secondary:
                    "border border-hairline bg-[image:var(--fill-control)] text-secondary-foreground shadow-control hover:bg-[image:var(--fill-control-hover)] active:brightness-95 active:shadow-control-pressed",
                outline:
                    "border border-hairline bg-transparent text-foreground hover:border-hairline-strong hover:bg-[image:var(--fill-control)] active:brightness-95",
                ghost: "text-foreground hover:bg-white/[0.07] active:bg-white/[0.04]",
                link: "text-foreground underline-offset-4 hover:text-accent hover:underline",
                glow: "bg-primary bg-[image:var(--fill-prominent)] text-primary-foreground shadow-[var(--shadow-control),var(--glow-primary)] hover:bg-[image:var(--fill-prominent-hover)] active:brightness-95 active:shadow-control-pressed",
                terminal:
                    "border border-hairline bg-[image:var(--fill-control)] font-mono text-foreground shadow-control hover:border-accent/60 hover:text-accent active:shadow-control-pressed",
            },
            size: {
                // Radii step with the control: the bigger the button, the
                // rounder it may be — never rounder than the surface holding it.
                default: "h-10 rounded-md px-4 py-2 md:h-10 md:px-4",
                sm: "h-10 rounded-[7px] px-4 md:h-9 md:px-3",
                lg: "h-12 rounded-lg px-8 md:h-11",
                icon: "h-11 w-11 rounded-md md:h-10 md:w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
