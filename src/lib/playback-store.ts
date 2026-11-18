/**
 * The dashboard's `positionStore` for `<phirepass-media-player>` (Continue
 * watching, T2.8): positions follow the signed-in person across browsers via
 * `/api/playback`. Same shape as the widget's `PositionStore`; kept as a
 * structural copy so the dashboard does not import widget internals.
 *
 * Failures resolve quietly: a position is a convenience and must never stop
 * playback.
 */
export type StoredPosition = { secs: number; duration: number; at: number };

export interface PlaybackStore {
    get(key: string): Promise<StoredPosition | null>;
    set(key: string, secs: number, duration: number): Promise<void>;
    clear(key: string): Promise<void>;
}

type Fetch = typeof fetch;

export function apiPositionStore(fetcher: Fetch = (...args) => fetch(...args)): PlaybackStore {
    const url = (key: string) => `/api/playback?key=${encodeURIComponent(key)}`;
    return {
        async get(key) {
            try {
                const res = await fetcher(url(key), { credentials: 'same-origin' });
                if (!res.ok) {
                    return null;
                }
                const body = (await res.json()) as { position?: StoredPosition | null };
                const p = body.position;
                return p && Number.isFinite(p.secs) && Number.isFinite(p.duration) ? p : null;
            } catch {
                return null;
            }
        },
        async set(key, secs, duration) {
            try {
                await fetcher('/api/playback', {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    // A stream of unknown length reports NaN or Infinity.
                    body: JSON.stringify({ key, secs, duration: Number.isFinite(duration) ? duration : 0 }),
                });
            } catch {
                /* a convenience */
            }
        },
        async clear(key) {
            try {
                await fetcher(url(key), { method: 'DELETE', credentials: 'same-origin' });
            } catch {
                /* a convenience */
            }
        },
    };
}
