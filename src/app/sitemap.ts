import type { MetadataRoute } from "next";

import { LEGAL_UPDATED_ISO } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

/**
 * Only the public, indexable surface belongs here. `/login` and `/signup` are
 * noindex, and everything under `/dashboard` is behind auth, so listing either
 * would ask crawlers to fetch pages we have already told them not to index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const legalUpdated = new Date(LEGAL_UPDATED_ISO);

    return [
        {
            url: SITE_URL,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: `${SITE_URL}/terms`,
            lastModified: legalUpdated,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE_URL}/privacy`,
            lastModified: legalUpdated,
            changeFrequency: "yearly",
            priority: 0.3,
        },
    ];
}
