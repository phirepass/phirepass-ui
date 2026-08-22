import { parseMonitor, type ParsedMonitor } from '@/app/lib/monitor-input';
import { DEMO_LIVE_ACTION_MESSAGE } from '@/lib/demo-mode';
import type { MonitorKind, MonitorStatus } from '@/types/monitor';

import {
    checkDemoMonitorNow,
    createDemoMonitor,
    createDemoToken,
    deleteDemoMonitor,
    deleteDemoNode,
    deleteDemoToken,
    demoMonitorDetail,
    demoMonitorOverview,
    demoMonitorPage,
    demoMonitorSummary,
    demoNodeExists,
    demoNodeServices,
    demoNodes,
    demoTokens,
    demoUser,
    renameDemoNode,
    updateDemoMonitor,
} from './store';

/**
 * The demo's answer to the API, spoken in the browser.
 *
 * Demo mode is a switch in the user's own settings, held in memory for as long
 * as the page is open — so there is no server involved and nothing to
 * configure. This module is what the patched `fetch` consults (see
 * `DemoModeProvider`): given a request the dashboard just made, it either
 * returns the response the demo fleet would have given, or `null` to let the
 * real request go out.
 *
 * Two rules keep it honest:
 *
 * - **Same contract as the server.** Status codes, error bodies and validation
 *   all match the routes in `src/app/api/`, `parseMonitor` included — a demo
 *   that accepts a monitor the real product would refuse is a demo of something
 *   that does not exist.
 * - **Deny by default.** Anything not listed here falls through to the network,
 *   so a route added later is served for real rather than silently answered
 *   with a fixture. The one thing this refuses outright is the WebSocket token:
 *   the demo fleet has no agent on the other end.
 */

const DEFAULT_MONITOR_LIMIT = 24;

const KINDS: MonitorKind[] = ['http', 'ssl', 'domain'];
const STATUSES: MonitorStatus[] = ['up', 'degraded', 'down', 'unknown', 'paused'];

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Mirrors the routes: an unrecognised value is ignored, not passed through. */
function parseEnum<T extends string>(raw: string | null, allowed: T[]): T | undefined {
    if (!raw) return undefined;
    return allowed.includes(raw as T) ? raw as T : undefined;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

interface DemoRequest {
    method: string;
    path: string;
    params: URLSearchParams;
    /** Parsed JSON body, or `{}` when there was none. Never throws. */
    body: () => Promise<Record<string, unknown>>;
}

async function handleNodes(request: DemoRequest): Promise<Response | null> {
    if (request.method === 'GET') {
        return json(demoNodes(request.params.get('id')));
    }

    if (request.method === 'PATCH') {
        const payload = await request.body();
        const id = typeof payload.id === 'string' ? payload.id.trim() : '';
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';

        if (!id) return json({ error: 'Node id is required' }, 400);
        if (!name) return json({ error: 'Node name is required' }, 400);
        if (name.length > 120) {
            return json({ error: 'Node name must be 120 characters or less' }, 400);
        }

        const outcome = renameDemoNode(id, name);
        if (outcome === 'not-found') return json({ error: 'Node not found' }, 404);
        if (outcome === 'duplicate') {
            return json({ error: 'You already have a node with that name' }, 409);
        }

        return json({ id, name });
    }

    if (request.method === 'DELETE') {
        const queryId = request.params.get('id');
        const id = (queryId ?? (await request.body()).id ?? '') as string;
        const trimmed = typeof id === 'string' ? id.trim() : '';

        if (!trimmed) return json({ error: 'Node id is required' }, 400);

        return deleteDemoNode(trimmed)
            ? json({ id: trimmed })
            : json({ error: 'Node not found' }, 404);
    }

    return null;
}

async function handleMonitors(request: DemoRequest): Promise<Response | null> {
    if (request.method === 'GET') {
        const page = parsePositiveInt(request.params.get('page'), 1);
        const limit = parsePositiveInt(request.params.get('limit'), DEFAULT_MONITOR_LIMIT);

        const result = demoMonitorPage({
            kind: parseEnum(request.params.get('kind'), KINDS),
            status: parseEnum(request.params.get('status'), STATUSES),
            search: request.params.get('q')?.trim() || undefined,
            limit,
            offset: (page - 1) * limit,
        });

        return json({ ...result, page, limit });
    }

    if (request.method === 'POST') {
        const parsed = parseMonitor(await request.body());
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        if (!demoNodeExists(parsed.value.node_id)) {
            return json({ error: 'Unknown agent' }, 400);
        }

        return json({ monitor: createDemoMonitor(parsed.value) }, 201);
    }

    return null;
}

async function handleMonitor(request: DemoRequest, monitorId: string): Promise<Response | null> {
    if (request.method === 'GET') {
        const detail = demoMonitorDetail(monitorId);
        return detail ? json(detail) : json({ error: 'Monitor not found' }, 404);
    }

    if (request.method === 'PATCH') {
        // The stored monitor supplies the defaults, so a PATCH carrying only
        // `paused` keeps every other field — same as the route's `UPDATE`.
        const current = demoMonitorSummary(monitorId);
        if (!current) return json({ error: 'Monitor not found' }, 404);

        const parsed = parseMonitor(await request.body(), current as Partial<ParsedMonitor>);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        if (!demoNodeExists(parsed.value.node_id)) {
            return json({ error: 'Unknown agent' }, 400);
        }

        return json({ monitor: updateDemoMonitor(monitorId, parsed.value) });
    }

    if (request.method === 'DELETE') {
        return deleteDemoMonitor(monitorId)
            ? json({ id: monitorId })
            : json({ error: 'Monitor not found' }, 404);
    }

    return null;
}

async function handlePat(request: DemoRequest): Promise<Response | null> {
    if (request.method === 'POST') {
        const payload = await request.body();
        const name = typeof payload.name === 'string' && payload.name.trim()
            ? payload.name.trim()
            : `PAT #${Math.random().toString(36).slice(2, 10)}`;
        const expiresAt = typeof payload.expires_at === 'string' ? payload.expires_at : null;

        return json({ token: createDemoToken(name, expiresAt) }, 201);
    }

    return null;
}

/**
 * Answers one request from the demo fleet, or `null` to let it reach the
 * network.
 */
export async function demoApiResponse(
    method: string,
    path: string,
    params: URLSearchParams,
    readBody: () => Promise<Record<string, unknown>>,
): Promise<Response | null> {
    const request: DemoRequest = { method: method.toUpperCase(), path, params, body: readBody };

    if (path === '/api/profile') {
        // The session stays real — this only changes the name and address on
        // screen, so a presenter is not showing their own inbox to the room.
        return request.method === 'GET' ? json(demoUser()) : null;
    }

    if (path === '/api/nodes') return handleNodes(request);

    if (path === '/api/nodes/services') {
        if (request.method !== 'GET') return null;

        const nodeId = params.get('id');
        if (!nodeId) return json({ error: 'Node id is required' }, 400);

        const services = demoNodeServices(nodeId, params.get('kind') ?? undefined);
        return services
            // No passwords, fake or otherwise: the edit dialog renders an empty
            // field here, which is what it does for a real service too.
            ? json({ services: services.map((service) => ({ ...service, password: null })) })
            : json({ error: 'Node not found' }, 404);
    }

    if (path === '/api/monitors') return handleMonitors(request);

    if (path === '/api/monitors/summary') {
        if (request.method !== 'GET') return null;

        const raw = params.get('kind');
        if (raw && !KINDS.includes(raw as MonitorKind)) {
            return json({ error: 'Unknown monitor kind' }, 400);
        }

        return json(demoMonitorOverview((raw as MonitorKind) ?? undefined));
    }

    // `/api/monitors/{id}` and `/api/monitors/{id}/check`, checked after the
    // fixed paths above so `summary` is never read as a monitor id.
    const monitorMatch = /^\/api\/monitors\/([^/]+)(\/check)?$/.exec(path);
    if (monitorMatch) {
        const monitorId = decodeURIComponent(monitorMatch[1]);

        if (monitorMatch[2]) {
            if (request.method !== 'POST') return null;

            const outcome = checkDemoMonitorNow(monitorId);
            if (outcome === 'not-found') return json({ error: 'Monitor not found' }, 404);
            if (outcome === 'paused') {
                return json({ error: 'Resume the monitor before checking it' }, 409);
            }

            return json({ monitor: outcome });
        }

        return handleMonitor(request, monitorId);
    }

    if (path === '/api/pat/list') {
        return request.method === 'GET' ? json({ tokens: demoTokens() }) : null;
    }

    if (path === '/api/pat') return handlePat(request);

    const tokenMatch = /^\/api\/pat\/([^/]+)$/.exec(path);
    if (tokenMatch && request.method === 'DELETE') {
        const tokenId = decodeURIComponent(tokenMatch[1]);
        return deleteDemoToken(tokenId)
            ? json({ success: true })
            : json({ error: 'Token not found' }, 404);
    }

    if (path === '/api/auth/websocket-token') {
        // The one thing the demo cannot fake: this token buys a WebSocket to an
        // agent, and the fleet on screen has none. Refused with a reason rather
        // than issued and left to fail against the relay.
        return json({ error: DEMO_LIVE_ACTION_MESSAGE }, 503);
    }

    return null;
}
