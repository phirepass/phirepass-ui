import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest and linked automatically.
 *
 * `start_url` is the dashboard rather than the marketing page: someone who
 * installs this wants their nodes, and an unauthenticated launch redirects to
 * the login screen anyway. `id` is pinned so the installed app keeps its
 * identity if `start_url` ever changes.
 *
 * Two icon sets on purpose. The `any` pair is the mark as drawn, rounded tile
 * included. The `maskable` pair is full-bleed with the artwork inset to 80%,
 * because Android crops maskable icons to its own shape — feeding it the
 * rounded tile would produce a rounded icon inside a rounded mask.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/dashboard",
        lang: "en",
        dir: "ltr",
        name: "Phirepass — Remote Access & Uptime Monitoring",
        short_name: "Phirepass",
        description:
            "Reach your machines from any browser — SSH, SFTP, RDP and internal web apps — and monitor their uptime.",
        start_url: "/dashboard/nodes",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        background_color: "#0b0d12",
        theme_color: "#0b0d12",
        categories: ["developer", "productivity", "utilities"],
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
            { name: "Nodes", url: "/dashboard/nodes" },
            { name: "Monitors", url: "/dashboard/monitors" },
        ],
    };
}
