import { useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import { Button } from '@/components/ui/button';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { CheckCircle, XCircle, Loader2, Terminal } from 'lucide-react';
import type { PublicRuntimeConfig } from '@/lib/runtime-config';

type AuthStatus = 'pending' | 'verifying' | 'success' | 'error' | 'expired';

type WebAuthResponse = {
    type: 'AuthResponse';
    cid: string;
    success: boolean;
    version: string;
};

const FRAME_VERSION = 1;
const FRAME_KIND_WEB = 0;
const FRAME_CODE_AUTH = 10;
const FRAME_CODE_AUTH_RESPONSE = 11;
const FRAME_ENCODING_JSON = 0;
const UI_WEBSOCKET_VERSION = 'phirepass-ui';

function buildWebsocketEndpoint(config: PublicRuntimeConfig) {
    const explicitUrl = config.NEXT_PUBLIC_WS_URL?.trim();
    if (explicitUrl) {
        return `${explicitUrl.replace(/\/$/, '')}/api/web/ws`;
    }

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    const host = config.NEXT_PUBLIC_SERVER_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    const port = config.NEXT_PUBLIC_SERVER_PORT || (isHttps ? '443' : '8080');
    return `${protocol}//${host}:${port}/api/web/ws`;
}

function encodeAuthFrame(token: string) {
    const payload = new TextEncoder().encode(JSON.stringify({
        type: 'Auth',
        token,
        version: UI_WEBSOCKET_VERSION,
    }));

    const frame = new Uint8Array(8 + payload.byteLength);
    frame[0] = FRAME_VERSION;
    frame[1] = FRAME_ENCODING_JSON;
    frame[2] = FRAME_KIND_WEB;
    frame[3] = FRAME_CODE_AUTH;
    new DataView(frame.buffer).setUint32(4, payload.byteLength, false);
    frame.set(payload, 8);
    return frame;
}

function decodeAuthResponse(data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    if (bytes.byteLength < 8) {
        return null;
    }

    const encoding = bytes[1];
    const kind = bytes[2];
    const code = bytes[3];
    const payloadSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);

    if (encoding !== FRAME_ENCODING_JSON || kind !== FRAME_KIND_WEB || code !== FRAME_CODE_AUTH_RESPONSE) {
        return null;
    }

    if (bytes.byteLength < 8 + payloadSize) {
        return null;
    }

    const payloadBytes = bytes.slice(8, 8 + payloadSize);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<WebAuthResponse>;

    if (payload.type !== 'AuthResponse' || typeof payload.cid !== 'string' || typeof payload.success !== 'boolean') {
        return null;
    }

    return payload as WebAuthResponse;
}

async function authorizeDeviceWithServer(config: PublicRuntimeConfig) {
    const tokenResponse = await fetch('/api/auth/websocket-token', {
        credentials: 'same-origin',
        cache: 'no-store',
    });

    if (!tokenResponse.ok) {
        throw new Error(tokenResponse.status === 401 ? 'You must be signed in to authorize this device.' : 'Failed to load auth token.');
    }

    const tokenPayload = await tokenResponse.json() as { token?: string };
    if (!tokenPayload.token) {
        throw new Error('Auth token response was empty.');
    }

    await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(buildWebsocketEndpoint(config));
        const timeoutId = window.setTimeout(() => {
            socket.close();
            reject(new Error('Timed out while waiting for websocket auth response.'));
        }, 10000);

        socket.binaryType = 'arraybuffer';

        socket.addEventListener('open', () => {
            socket.send(encodeAuthFrame(tokenPayload.token!));
        }, { once: true });

        socket.addEventListener('message', (event) => {
            if (!(event.data instanceof ArrayBuffer)) {
                return;
            }

            const response = decodeAuthResponse(event.data);
            if (!response) {
                return;
            }

            window.clearTimeout(timeoutId);
            socket.close();

            if (response.success) {
                resolve();
                return;
            }

            reject(new Error('Server rejected websocket auth.'));
        });

        socket.addEventListener('error', () => {
            window.clearTimeout(timeoutId);
            reject(new Error('Websocket connection failed.'));
        }, { once: true });

        socket.addEventListener('close', () => {
            window.clearTimeout(timeoutId);
        }, { once: true });
    });
}

export default function DeviceAuth() {
    const [status, setStatus] = useState<AuthStatus>('pending');
    const [deviceCode, setDeviceCode] = useState('');
    const [deviceName, setDeviceName] = useState('Unknown Device');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const { config } = useRuntimeConfig();

    useEffect(() => {
        // Deliberately read once after mount (not derived at render time): this page is
        // server-rendered and reading window.location during render would cause a hydration mismatch.
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDeviceCode(params.get('code') || '');
            setDeviceName(params.get('name') || 'Unknown Device');
        }
    }, []);

    const handleAuthorize = async () => {
        try {
            setErrorMessage(null);
            setStatus('verifying');
            await authorizeDeviceWithServer(config);
            setStatus('success');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Authorization failed.');
            setStatus('error');
        }
    };

    const handleDeny = () => {
        setErrorMessage(null);
        setStatus('error');
    };

    useEffect(() => {
        // Check if code is expired (example: after 10 minutes)
        // Deliberately read once after mount (not derived at render time): this page is
        // server-rendered and reading window.location during render would cause a hydration mismatch.
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const codeTimestamp = params.get('ts');
            if (codeTimestamp) {
                const timestamp = parseInt(codeTimestamp);
                const tenMinutes = 10 * 60 * 1000;
                if (Date.now() - timestamp > tenMinutes) {
                    // eslint-disable-next-line react-hooks/set-state-in-effect
                    setStatus('expired');
                }
            }
        }
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Background grid effect */}
            <div className="fixed inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />

            <div className="w-full max-w-md animate-fade-in">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <PhirepassLogo className="w-16 h-16 rounded-2xl mb-4 glow-primary" />
                    <h1 className="text-3xl font-bold">
                        <span className="text-gradient">Phire</span>
                        <span className="text-foreground">pass</span>
                    </h1>
                    <p className="text-muted-foreground mt-2">Device Authorization</p>
                </div>

                {/* Authorization Card */}
                <div className="gradient-card border border-border rounded-2xl p-8">
                    {status === 'pending' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                                    <Terminal className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-xl font-semibold text-foreground mb-2">
                                    Authorize Device
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    A device is requesting access to your Phirepass account
                                </p>
                            </div>

                            <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Device Name</span>
                                    <span className="font-mono text-foreground">{deviceName}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Device Code</span>
                                    <span className="font-mono text-primary">{deviceCode || 'XXXX-XXXX'}</span>
                                </div>
                            </div>

                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                                <p className="text-sm text-destructive">
                                    Only authorize devices you trust. This will grant full access to manage your nodes.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleDeny}
                                >
                                    Deny
                                </Button>
                                <Button
                                    variant="glow"
                                    className="flex-1"
                                    onClick={handleAuthorize}
                                >
                                    Authorize
                                </Button>
                            </div>
                        </div>
                    )}

                    {status === 'verifying' && (
                        <div className="text-center py-8">
                            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Verifying Device...
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Please wait while we authorize the device
                            </p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Device Authorized!
                            </h2>
                            <p className="text-muted-foreground text-sm mb-6">
                                The device has been successfully connected. You can close this window.
                            </p>
                            <div className="bg-secondary/50 rounded-lg p-4">
                                <p className="text-xs text-muted-foreground">
                                    The agent on your server will now receive its authentication token automatically.
                                </p>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                                <XCircle className="w-10 h-10 text-destructive" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Authorization Denied
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                {errorMessage || 'The device was not authorized. You can close this window.'}
                            </p>
                        </div>
                    )}

                    {status === 'expired' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                                <XCircle className="w-10 h-10 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Code Expired
                            </h2>
                            <p className="text-muted-foreground text-sm mb-4">
                                This authorization code has expired. Please restart the agent on your server to get a new code.
                            </p>
                            <Button variant="outline" onClick={() => window.close()}>
                                Close Window
                            </Button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground mt-6">
                    Need help?{' '}
                    <a href="#" className="text-primary hover:underline">
                        View documentation
                    </a>
                </p>
            </div>
        </div>
    );
}
