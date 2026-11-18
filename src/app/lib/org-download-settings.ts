/**
 * Organisation → Downloads (T1.21): the settings an organisation keeps for
 * every node in it. Stored in `organization_download_settings.settings` as
 * jsonb; a missing key is its default, so a row written before a setting
 * existed still reads correctly.
 *
 * - keep_days: how long finished download rows are kept. Read by the
 *   retention job (`download-retention.ts`); files are never touched.
 * - stream_link_hours: the longest a cast or player link works. Stored now,
 *   used when streaming arrives (phase 2).
 *
 * The per-node policy (allowed / links only / blocked) is its own table,
 * `node_download_policy`, and its own route.
 *
 * Import-free so `node --test` and the database test run it as is.
 */

export interface OrgDownloadSettings {
    keep_days: number;
    stream_link_hours: number;
}

export const ORG_DOWNLOAD_DEFAULTS: OrgDownloadSettings = {
    keep_days: 30,
    stream_link_hours: 6,
};

const LIMITS: Record<keyof OrgDownloadSettings, { min: number; max: number; reason: string }> = {
    keep_days: { min: 1, max: 3650, reason: 'Keep finished downloads for 1 to 3650 days.' },
    stream_link_hours: { min: 1, max: 168, reason: 'Links can last 1 to 168 hours.' },
};

/** The stored object, with defaults for whatever it lacks or holds badly. */
export function readOrgSettings(stored: unknown): OrgDownloadSettings {
    const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
    const out = { ...ORG_DOWNLOAD_DEFAULTS };
    for (const key of Object.keys(LIMITS) as (keyof OrgDownloadSettings)[]) {
        const v = s[key];
        if (typeof v === 'number' && Number.isInteger(v) && v >= LIMITS[key].min && v <= LIMITS[key].max) {
            out[key] = v;
        }
    }
    return out;
}

/** A request body, or the first field out of range and why. */
export function parseOrgSettings(body: unknown): { ok: OrgDownloadSettings } | { field: string; error: string } {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const out = { ...ORG_DOWNLOAD_DEFAULTS };
    for (const key of Object.keys(LIMITS) as (keyof OrgDownloadSettings)[]) {
        const v = b[key];
        const { min, max, reason } = LIMITS[key];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return { field: key, error: reason };
        out[key] = v;
    }
    return { ok: out };
}

export const GET_ORG_SETTINGS_SQL =
    'SELECT settings FROM organization_download_settings WHERE org_id = $1';

/** Upsert in one statement; `$2` is the whole settings object. */
export const SET_ORG_SETTINGS_SQL =
    'INSERT INTO organization_download_settings (org_id, settings, changed_by, changed_at)'
    + ' VALUES ($1, $2::jsonb, $3, now())'
    + ' ON CONFLICT (org_id) DO UPDATE SET settings = EXCLUDED.settings,'
    + ' changed_by = EXCLUDED.changed_by, changed_at = now()'
    + ' RETURNING settings';
