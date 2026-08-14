/**
 * Canonical origin for absolute URLs in metadata (OpenGraph images, canonical
 * links, the sitemap). Overridable so preview deployments do not advertise the
 * production host as their canonical.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://phirepass.com";

/**
 * The social card image, shared by every page that declares its own OpenGraph
 * block — overriding `openGraph` replaces the parent's `images` outright, so a
 * page that sets a title without re-declaring this silently loses its preview
 * image.
 */
export const OG_IMAGE = {
    url: "/listing.png",
    width: 2722,
    height: 2067,
    alt: "The Phirepass dashboard listing connected nodes with live CPU, memory and uptime",
} as const;
