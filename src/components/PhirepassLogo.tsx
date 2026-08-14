/**
 * The Phirepass mark.
 *
 * The composition says what the product does: a node (solid dot) sits inside a
 * closed boundary (the hexagon), and a single path leaves it, outbound, to the
 * relay (the open ring). Nothing enters — every line in the mark travels one
 * way, out of the shape.
 *
 * The treatment is borrowed from the Rio terminal icon: high-saturation neon on
 * a near-black body rather than a flat coloured tile. Rio sweeps cyan (#63eafb)
 * to magenta (#f95ee0); this rotates that same energy into the green half of
 * the wheel so it stays on brand with the accent colour.
 *
 * Gradient ids are static. Several instances can appear on one page, but they
 * all define the same gradients, so the duplicate ids resolve identically — and
 * that keeps this usable from server components, where `useId` is unavailable.
 */
export function PhirepassLogo({
    className = 'w-8 h-8',
    title,
}: {
    className?: string;
    /** Accessible name. Omit when a text wordmark sits beside the mark. */
    title?: string;
}) {
    return (
        <svg
            viewBox="0 0 48 48"
            className={`pp-logo ${className}`}
            role={title ? 'img' : 'presentation'}
            aria-hidden={title ? undefined : true}
            xmlns="http://www.w3.org/2000/svg"
        >
            {title ? <title>{title}</title> : null}
            <defs>
                {/* userSpaceOnUse, so one sweep runs across the whole mark
                    rather than every shape repeating the full gradient inside
                    its own bounding box: the hexagon sits in the lime end, the
                    relay ring in the cyan end. */}
                <linearGradient
                    id="pp-mark"
                    gradientUnits="userSpaceOnUse"
                    x1="8"
                    y1="41"
                    x2="40"
                    y2="9"
                >
                    <stop offset="0%" stopColor="hsl(122 88% 52%)" />
                    <stop offset="35%" stopColor="hsl(150 92% 56%)" />
                    <stop offset="70%" stopColor="hsl(172 92% 58%)" />
                    <stop offset="100%" stopColor="hsl(196 96% 66%)" />
                </linearGradient>
                <linearGradient id="pp-body" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(152 32% 13%)" />
                    <stop offset="50%" stopColor="hsl(172 34% 9%)" />
                    <stop offset="100%" stopColor="hsl(196 38% 8%)" />
                </linearGradient>
                {/* Bloom behind the path, the way Rio lights its icon body. */}
                <radialGradient id="pp-bloom" cx="62%" cy="30%" r="60%">
                    <stop offset="0%" stopColor="hsl(172 92% 58%)" stopOpacity="0.40" />
                    <stop offset="100%" stopColor="hsl(172 92% 58%)" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="pp-edge" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(122 88% 52%)" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="hsl(196 96% 66%)" stopOpacity="0.55" />
                </linearGradient>
            </defs>

            {/* Body: near-black, faintly green, with a lit edge. */}
            <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#pp-body)" />
            <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#pp-bloom)" />
            <rect
                x="1"
                y="1"
                width="46"
                height="46"
                rx="12"
                fill="none"
                stroke="url(#pp-edge)"
                strokeWidth="1.8"
            />

            {/* The closed boundary the machine sits behind. */}
            <path
                d="M18.5 19.5 L27 24.4 L27 34.2 L18.5 39.1 L10 34.2 L10 24.4 Z"
                fill="none"
                stroke="url(#pp-mark)"
                strokeWidth="2.1"
                strokeLinejoin="round"
                opacity="0.82"
            />

            {/* The one path out, from the node to the relay: a dim rail with a
                packet travelling along it, outbound, forever. */}
            <path
                d="M18.5 29.3 C 21.2 22.6, 26.4 18.6, 32.4 17.1"
                fill="none"
                stroke="url(#pp-mark)"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity="0.6"
            />
            <path
                className="pp-flow"
                d="M18.5 29.3 C 21.2 22.6, 26.4 18.6, 32.4 17.1"
                fill="none"
                stroke="url(#pp-mark)"
                strokeWidth="3.2"
                strokeLinecap="round"
            />

            {/* The node itself: solid, inside. */}
            <circle className="pp-breathe" cx="18.5" cy="29.3" r="3.6" fill="url(#pp-mark)" />

            {/* The relay: open, outside. */}
            <circle
                className="pp-pulse"
                cx="37.2"
                cy="13.6"
                r="4.1"
                fill="none"
                stroke="url(#pp-mark)"
                strokeWidth="2.4"
            />
        </svg>
    );
}
