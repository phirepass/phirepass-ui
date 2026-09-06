/**
 * Canonical origin for absolute URLs in metadata (OpenGraph images, canonical
 * links, the sitemap) and for the one link this product emails anybody — the
 * invitation. Overridable so preview deployments do not advertise the
 * production host as their canonical.
 *
 * **`www`, not the apex.** The edge answers `https://phirepass.com/<anything>`
 * with `301 https://www.phirepass.com/` — the path is dropped, not carried — so
 * every deep link built on the apex lands on the marketing home page. That is
 * survivable for a canonical tag and fatal for an invitation: the person clicks
 * accept, arrives at the front page, and nothing has happened. `www` is the
 * host that actually serves the app, so it is the host absolute URLs are built
 * from.
 *
 * Fixing the redirect to preserve the path is still worth doing — it lives at
 * the edge rather than in Traefik (`phirepass-env/backend/docker-compose.yml`
 * has no www rule at all) — but this default should not depend on it.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.phirepass.com";

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
