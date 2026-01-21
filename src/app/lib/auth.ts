import crypto from 'node:crypto';

type JWTPayload = Record<string, unknown> & {
    iat: number;
    exp: number;
};

function base64url(input: Buffer | string) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function signHS256(data: string, secret: string) {
    return base64url(crypto.createHmac('sha256', secret).update(data).digest());
}

export function signJWT(payload: Record<string, unknown>, expiresInSeconds: number): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');

    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + expiresInSeconds } as JWTPayload;

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(fullPayload));
    const toSign = `${encodedHeader}.${encodedPayload}`;
    const signature = signHS256(toSign, secret);

    return `${toSign}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');

    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;

    const expectedSig = signHS256(`${headerB64}.${payloadB64}`, secret);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;

    try {
        const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson) as JWTPayload;
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp !== 'number' || now > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export function buildAuthCookie(token: string, maxAgeSeconds: number, domain?: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [
        `auth_token=${token}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}

export function clearAuthCookie(domain?: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [
        `auth_token=`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=0`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}

export function buildCookie(name: string, value: string, maxAgeSeconds: number, domain?: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [
        `${name}=${value}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}

export function clearCookie(name: string, domain?: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [
        `${name}=`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
        `Max-Age=0`,
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (isProd) parts.push('Secure');
    return parts.join('; ');
}
