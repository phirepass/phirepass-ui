import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Console buttons: flat fills, a 1px border on the neutral variants, a tint
 * overlay for hover and press. The hover/press overlays are `background-image`
 * so a caller recolouring a button through `className` (every destructive
 * confirm is `buttonVariants()` plus `bg-destructive`) keeps working —
 * tailwind-merge resolves the colour conflict and the overlay composes on top.
 *
 * The `md:` size steps keep touch targets at 40px+ on phones and tighten to a
 * 36/32px rhythm on the desktop.
 */
const buttonVariants = cva(
    [
        "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
        "text-[13px] font-medium",
        "transition-[background-image,background-color,box-shadow,color,filter,border-color] duration-150 ease-mac",
        // The macOS focus ring: a soft accent halo hugging the control's own
        // shape, rather than an offset outline floating away from it.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    ],
    {
        variants: {
            variant: {
                // Cobalt: the one interactive hue. Never green — green is
                // reserved for "online".
                default:
                    "bg-accent text-accent-foreground hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)]",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)]",
                accent:
                    "bg-accent text-accent-foreground hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)]",
                // The standard macOS push button: a translucent control fill
                // over whatever it sits on, edged with a hairline.
                secondary:
                    "border border-hairline bg-secondary text-secondary-foreground hover:border-hairline-strong hover:bg-[image:var(--fill-control-hover)] active:bg-[image:var(--fill-sheen-pressed)]",
                outline:
                    "border border-hairline bg-transparent text-foreground hover:border-hairline-strong hover:bg-secondary active:bg-[image:var(--fill-sheen-pressed)]",
                ghost: "text-foreground hover:bg-secondary active:bg-muted",
                link: "text-foreground underline-offset-4 hover:text-accent hover:underline",
                glow: "bg-accent text-accent-foreground hover:bg-[image:var(--fill-sheen-hover)] active:bg-[image:var(--fill-sheen-pressed)]",
                terminal:
                    "border border-hairline bg-secondary font-mono text-foreground hover:border-accent/60 hover:text-accent",
            },
            size: {
                // Radii step with the control: the bigger the button, the
                // rounder it may be — never rounder than the surface holding it.
                default: "h-10 rounded-md px-4 md:h-9 md:px-3.5",
                sm: "h-10 rounded-sm px-3.5 md:h-8 md:px-2.5 md:text-[13px]",
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
