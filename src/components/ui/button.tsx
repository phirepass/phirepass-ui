import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * macOS push buttons.
 *
 * Three things separate one from a coloured rectangle, and every variant below
 * has all three: a sheen that lights the top edge and shades the bottom
 * (`--fill-sheen`), a specular highlight plus a tight contact shadow
 * (`shadow-control`), and a press state that sinks the surface inward
 * (`shadow-control-pressed`) instead of shrinking it. macOS controls do not
 * scale under the pointer — they darken and recess — so nothing here uses
 * `active:scale`.
 *
 * The sheen is deliberately colour-agnostic. Callers routinely recolour a
 * button through `className` — every destructive confirmation in the app is
 * `buttonVariants()` plus `bg-destructive` — and `tailwind-merge` resolves
 * background-*colour* conflicts but not background-*image* ones, so a fill
 * baked per variant would survive the override and paint the old colour over
 * the new one.
 *
 * `default` stays near-white rather than taking the emerald accent: that green
 * already means "online" on every node card, and a CTA wearing it would compete
 * with status. Emerald is available as `accent` for the rare case that wants it.
 *
 * Compact scale: the `md:` steps keep touch targets at 40px+ on phones and
 * tighten to a 36/32px desktop rhythm, so a toolbar of buttons, inputs and
 * selects lines up on one height.
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
                    "bg-primary text-primary-foreground bg-[image:var(--fill-sheen)] shadow-control hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)] active:shadow-control-pressed",
                destructive:
                    "bg-destructive text-destructive-foreground bg-[image:var(--fill-sheen)] shadow-control hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)] active:shadow-control-pressed",
                accent:
                    "bg-accent text-accent-foreground bg-[image:var(--fill-sheen)] shadow-control hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)] active:shadow-control-pressed",
                // The standard macOS push button: a translucent control fill
                // over whatever it sits on, edged with a hairline.
                secondary:
                    "border border-hairline bg-[image:var(--fill-control)] text-secondary-foreground shadow-control hover:bg-[image:var(--fill-control-hover)] active:bg-[image:var(--fill-sheen-pressed)] active:shadow-control-pressed",
                outline:
                    "border border-hairline bg-transparent text-foreground hover:border-hairline-strong hover:bg-[image:var(--fill-control)] active:bg-[image:var(--fill-sheen-pressed)]",
                ghost: "text-foreground hover:bg-white/[0.07] active:bg-white/[0.04]",
                link: "text-foreground underline-offset-4 hover:text-accent hover:underline",
                glow: "bg-primary text-primary-foreground bg-[image:var(--fill-sheen)] shadow-[var(--shadow-control),var(--glow-primary)] hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)] active:shadow-control-pressed",
                terminal:
                    "border border-hairline bg-[image:var(--fill-control)] font-mono text-foreground shadow-control hover:border-accent/60 hover:text-accent active:shadow-control-pressed",
            },
            size: {
                // Radii step with the control: the bigger the button, the
                // rounder it may be — never rounder than the surface holding it.
                default: "h-10 rounded-md px-4 md:h-9 md:px-3.5",
                sm: "h-10 rounded-[6px] px-3.5 md:h-8 md:px-2.5 md:text-[13px]",
                lg: "h-11 rounded-lg px-6 md:h-10",
                icon: "h-10 w-10 rounded-md md:h-9 md:w-9",
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
