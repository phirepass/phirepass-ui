import { json_response } from '@/app/lib/framework';
import { verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';

type NodeSettings = Record<string, unknown>;

type ServiceDetail = {
    kind: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    visibility: 'public' | 'private';
    scheme: 'http' | 'https' | null;
};

function normalizeSettings(value: unknown): NodeSettings {
    if (!value) {
        return {};
    }

    if (typeof value === 'string') {
        try {
            return normalizeSettings(JSON.parse(value));
        } catch {
            return {};
        }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as NodeSettings;
    }

    return {};
}

function normalizeServiceKind(value: unknown): string {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function toServiceDetail(entry: unknown): ServiceDetail | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const raw = entry as Record<string, unknown>;
    const kind = normalizeServiceKind(raw.kind);
    if (!kind) {
        return null;
    }

    return {
        kind,
        host: typeof raw.host === 'string' ? raw.host : '',
        port: typeof raw.port === 'number' ? raw.port : 0,
        username: typeof raw.username === 'string' ? raw.username : null,
        password: typeof raw.password === 'string' ? raw.password : null,
        visibility: raw.visibility === 'public' ? 'public' : 'private',
        scheme: raw.scheme === 'https' ? 'https' : raw.scheme === 'http' ? 'http' : null,
    };
}

function extractServices(settings: NodeSettings): ServiceDetail[] {
    const value = settings.services;
    const entries = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : [];

    return entries
        .map(toServiceDetail)
        .filter((service): service is ServiceDetail => service !== null);
}

// Returns the full configuration (including credentials) for a node's services,
// so the edit dialog can be pre-filled. Kept out of the polled /api/nodes list
// response since that's fetched repeatedly and doesn't need credentials in it.
export async function GET(req: Request) {
    try {
        const user = await verifyToken();
        const url = new URL(req.url);
        const nodeId = url.searchParams.get('id');
        const requestedKind = normalizeServiceKind(url.searchParams.get('kind'));

        if (!nodeId) {
            return json_response({ error: 'Node id is required' }, 400);
        }

        const result = await query(
            `SELECT settings FROM nodes WHERE id = $1 AND user_id = $2`,
            [nodeId, user.id]
        );

        if (result.rowCount === 0) {
            return json_response({ error: 'Node not found' }, 404);
        }

        const settings = normalizeSettings(result.rows[0].settings);
        const services = extractServices(settings)
            .filter((service) => !requestedKind || service.kind === requestedKind);

        return json_response({ services }, 200);
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return json_response({ error: 'Server error' }, 500);
    }
}
