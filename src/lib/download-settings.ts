/**
 * A node's download settings (T1.21), as the Downloads panel edits them.
 *
 * The types mirror `DownloadSettings` / `NodeSettingsView` in
 * `phirepass-rs/common/src/protocol/fetch.rs`. The defaults below are the one
 * TypeScript copy of the Rust `impl Default`; both are tested against the same
 * JSON (`download-settings-default.json`, kept identical in both repos).
 *
 * The ranges mirror `server/src/fetch/settings.rs::check`, which is what
 * decides: these only let the form say so before a round trip. The folder
 * itself is judged by the node, which answers with the field and the reason.
 *
 * Import-free so `node --test` runs it as is.
 */

export interface DownloadWindow {
    /** Minutes from midnight in `timezone`; start > end crosses midnight. */
    start_min: number;
    end_min: number;
    /** Weekday mask, bit 0 = Monday. */
    days: number;
    timezone: string;
}

export interface DownloadSettings {
    folder: string | null;
    max_active: number;
    max_jobs: number;
    min_free_bytes: number;
    allow_private: boolean;
    max_players: number;
    stall_secs: number;
    metadata_secs: number;
    retry_max_secs: number;
    window: DownloadWindow | null;
    down_bps_cap: number | null;
    up_bps_cap: number | null;
}

export interface SettingsRejection {
    version: number;
    field: string;
    reason: string;
}

export interface NodeSettingsView {
    /** 0 when nothing was ever saved: `settings` are then the defaults. */
    version: number;
    applied_version: number;
    settings: DownloadSettings;
    rejected: SettingsRejection | null;
}

export const GB = 2 ** 30;

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
    folder: null,
    max_active: 3,
    max_jobs: 50,
    min_free_bytes: 2 * GB,
    allow_private: false,
    max_players: 8,
    stall_secs: 60,
    metadata_secs: 600,
    retry_max_secs: 3600,
    window: null,
    down_bps_cap: null,
    up_bps_cap: null,
};

type NumberField = 'max_active' | 'max_jobs' | 'max_players' | 'stall_secs' | 'metadata_secs' | 'retry_max_secs';

/** The server's ranges, with its sentences. */
export const RANGES: Record<NumberField, { min: number; max: number; reason: string }> = {
    max_active: { min: 1, max: 20, reason: 'Between 1 and 20 downloads can run at once.' },
    max_jobs: { min: 1, max: 1000, reason: 'A node keeps between 1 and 1000 downloads.' },
    max_players: { min: 1, max: 64, reason: 'Between 1 and 64 players at once.' },
    stall_secs: { min: 10, max: 3600, reason: 'Between 10 seconds and an hour.' },
    metadata_secs: { min: 60, max: 86_400, reason: 'Between a minute and a day.' },
    retry_max_secs: { min: 60, max: 86_400, reason: 'Between a minute and a day.' },
};

export const MAX_FREE_BYTES = 1024 * GB;

/** The first field out of range, as the server would refuse it. */
export function checkSettings(s: DownloadSettings): { field: string; reason: string } | null {
    if (s.folder !== null && (!s.folder.startsWith('/') || s.folder.length > 4096)) {
        return { field: 'folder', reason: 'Give the full path of a folder, starting with /.' };
    }
    for (const field of Object.keys(RANGES) as NumberField[]) {
        const { min, max, reason } = RANGES[field];
        const v = s[field];
        if (!Number.isInteger(v) || v < min || v > max) return { field, reason };
    }
    if (!(s.min_free_bytes >= 0 && s.min_free_bytes <= MAX_FREE_BYTES)) {
        return { field: 'min_free_bytes', reason: 'Keep at most 1 TB free.' };
    }
    const w = s.window;
    if (w && (w.start_min >= 1440 || w.end_min >= 1440 || w.start_min === w.end_min
        || (w.days & 0x7f) === 0 || !w.timezone)) {
        return { field: 'window', reason: 'Choose a start, an end and at least one day.' };
    }
    return null;
}

/** The node's refusal of the latest save, under the field it names. */
export function fieldRefusal(view: NodeSettingsView | null, field: string): string | null {
    const r = view?.rejected;
    return r && view && r.version === view.version && r.field === field ? r.reason : null;
}

/** The line under the form: where the latest save stands. */
export function settingsStatus(view: NodeSettingsView | null, online: boolean, nodeName: string): string | null {
    if (!view || view.version === 0) return null;
    if (view.rejected && view.rejected.version === view.version) {
        return `${nodeName} kept its previous settings.`;
    }
    if (view.applied_version >= view.version) return `Applied on ${nodeName}.`;
    return online ? `Saved, applying on ${nodeName}…` : `Saved, applies when ${nodeName} is online.`;
}

export function hhmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function minutesOf(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    return h < 24 && m < 60 ? h * 60 + m : null;
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Nights, every day, in the browser's own time zone. */
export function defaultWindow(timezone: string): DownloadWindow {
    return { start_min: 60, end_min: 7 * 60, days: 0x7f, timezone };
}
