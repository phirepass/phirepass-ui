import { json_response } from '@/app/lib/framework';
import { authzErrorStatus, requireSession } from '@/app/lib/authz';
import { query } from '@/app/lib/db';
import { CLEAR_SQL, GET_SQL, SAVE_SQL, isFileKey, judge } from '@/app/lib/playback';

/**
 * Continue watching (screen G6). The player's `positionStore`, for the
 * signed-in person only: the user id comes from the session and never from the
 * request, so no key reaches somebody else's position.
 *
 *   GET  /api/playback?key=…          → { position: { secs, duration, at (unix ms) } | null }
 *   PUT  /api/playback { key, secs, duration } → { saved | cleared | ignored }
 *   DELETE /api/playback?key=…        → { cleared }
 *
 * Positions are a convenience: a database without the table answers "none"
 * rather than an error, and the player carries on.
 */
export async function GET(req: Request) {
    try {
        const session = await requireSession();
        const key = new URL(req.url).searchParams.get('key');
        if (!isFileKey(key)) {
            return json_response({ error: 'Invalid key' }, 400);
        }
        try {
            const result = await query(GET_SQL, [session.userId, key]);
            return json_response({ position: result.rows[0] ?? null }, 200);
        } catch (error) {
            console.warn('[playback] read unavailable:', error);
            return json_response({ position: null }, 200);
        }
    } catch (e) {
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function PUT(req: Request) {
    try {
        const session = await requireSession();
        const body = (await req.json().catch(() => null)) as { key?: unknown; secs?: unknown; duration?: unknown } | null;
        const key = body?.key;
        const action = judge(body?.secs, body?.duration);
        if (!isFileKey(key) || !action) {
            return json_response({ error: 'Invalid position' }, 400);
        }
        try {
            if (action.kind === 'save') {
                await query(SAVE_SQL, [session.userId, key, action.secs, action.duration]);
                return json_response({ result: 'saved' }, 200);
            }
            if (action.kind === 'clear') {
                await query(CLEAR_SQL, [session.userId, key]);
                return json_response({ result: 'cleared' }, 200);
            }
            return json_response({ result: 'ignored' }, 200);
        } catch (error) {
            console.warn('[playback] write unavailable:', error);
            return json_response({ result: 'unavailable' }, 200);
        }
    } catch (e) {
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await requireSession();
        const key = new URL(req.url).searchParams.get('key');
        if (!isFileKey(key)) {
            return json_response({ error: 'Invalid key' }, 400);
        }
        try {
            await query(CLEAR_SQL, [session.userId, key]);
            return json_response({ result: 'cleared' }, 200);
        } catch (error) {
            console.warn('[playback] clear unavailable:', error);
            return json_response({ result: 'unavailable' }, 200);
        }
    } catch (e) {
        const { status, body } = authzErrorStatus(e);
        return json_response(body, status);
    }
}
