import initChannel, { Channel } from 'phirepass-channel';

/**
 * Service create/update/delete run over the WebSocket channel rather than an
 * API route: the agent owns the authoritative service list and validates that
 * it can actually reach the local host/port before the server persists
 * anything.
 *
 * Every mutation follows the same shape — fetch a short-lived token, open a
 * channel, authenticate, issue one command, wait for its response — so that
 * dance lives here once instead of being repeated per service kind.
 */

const MUTATION_TIMEOUT_MS = 35_000;

export type ServiceKindName = 'ssh' | 'sftp' | 'http' | 'rdp';

export interface MutationTarget {
    id: string;
    server_id?: string | null;
}

interface RunOptions {
    endpoint: string;
    node: MutationTarget;
    /** Issued once the channel reports AuthSuccess. */
    command: (channel: Channel, nodeId: string) => void;
    /** Frame type carrying the outcome, e.g. 'CreateServiceResponse'. */
    responseType: string;
    /** Reads the success flag out of that response. */
    succeeded: (data: ServiceOpResponse) => boolean;
    /** Message used when the response says "no" without an error string. */
    refusedMessage: string;
}

export interface ServiceOpResponse {
    created?: boolean;
    updated?: boolean;
    deleted?: boolean;
    error?: string;
}

async function fetchWebSocketToken(): Promise<string> {
    const response = await fetch('/api/auth/websocket-token', {
        credentials: 'same-origin',
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(response.status === 401 ? 'Not authenticated.' : 'Failed to load auth token.');
    }

    const payload = await response.json() as { token?: string };
    if (!payload.token) {
        throw new Error('Auth token response was empty.');
    }

    return payload.token;
}

async function runServiceMutation({
    endpoint,
    node,
    command,
    responseType,
    succeeded,
    refusedMessage,
}: RunOptions): Promise<void> {
    const token = await fetchWebSocketToken();

    await initChannel();

    const channel = new Channel(endpoint, node.id, node.server_id ?? null);
    const nodeId = node.id;

    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (!settled) { settled = true; fn(); }
        };

        const timeoutId = setTimeout(() => {
            channel.disconnect();
            settle(() => reject(new Error('Connection timed out.')));
        }, MUTATION_TIMEOUT_MS);

        channel.on_connection_error((_event: unknown) => {
            clearTimeout(timeoutId);
            channel.disconnect();
            settle(() => reject(new Error('WebSocket connection error.')));
        });

        channel.on_connection_close((_event: unknown) => {
            clearTimeout(timeoutId);
            settle(() => reject(new Error('WebSocket connection closed unexpectedly.')));
        });

        channel.on_connection_open(() => {
            channel.authenticate(token, nodeId);
        });

        channel.on_protocol_message_type('AuthSuccess', () => {
            command(channel, nodeId);
        });

        channel.on_protocol_message_type(responseType, (data: ServiceOpResponse) => {
            clearTimeout(timeoutId);
            if (succeeded(data)) {
                settle(resolve);
            } else {
                settle(() => reject(new Error(data.error ?? refusedMessage)));
            }
            channel.disconnect();
        });

        channel.on_protocol_message_type('Error', (data: { message?: string }) => {
            clearTimeout(timeoutId);
            settle(() => reject(new Error(data.message ?? 'Server returned an error.')));
            channel.disconnect();
        });

        channel.connect();
    });
}

export interface ServiceDefinition {
    kind: ServiceKindName;
    name: string | null;
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    visibility?: string | null;
    scheme?: string | null;
}

/** Creates the service, or updates it in place when `serviceId` is given. */
export async function saveService(
    endpoint: string,
    node: MutationTarget,
    service: ServiceDefinition,
    serviceId?: string | null,
): Promise<void> {
    const isUpdate = Boolean(serviceId);
    const { kind, name, host, port } = service;
    const username = service.username ?? null;
    const password = service.password ?? null;
    const visibility = service.visibility ?? null;
    const scheme = service.scheme ?? null;

    await runServiceMutation({
        endpoint,
        node,
        responseType: isUpdate ? 'UpdateServiceResponse' : 'CreateServiceResponse',
        succeeded: (data) => Boolean(data.created || data.updated),
        refusedMessage: `Server refused to ${isUpdate ? 'update' : 'enable'} ${kind.toUpperCase()} service.`,
        command: (channel, nodeId) => {
            if (isUpdate && serviceId) {
                channel.update_service(nodeId, serviceId, kind, name, host, port, username, password, visibility, scheme, null);
            } else {
                channel.create_service(nodeId, kind, name, host, port, username, password, visibility, scheme, null);
            }
        },
    });
}

export async function removeService(
    endpoint: string,
    node: MutationTarget,
    serviceId: string,
    kind: ServiceKindName,
): Promise<void> {
    await runServiceMutation({
        endpoint,
        node,
        responseType: 'DeleteServiceResponse',
        succeeded: (data) => data.deleted === true,
        refusedMessage: `Server refused to delete ${kind.toUpperCase()} service.`,
        command: (channel, nodeId) => {
            channel.delete_service(nodeId, serviceId, null);
        },
    });
}
