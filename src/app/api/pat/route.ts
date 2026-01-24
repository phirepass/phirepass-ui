import { cookies } from 'next/headers';
import { hasSub, verifyJWT, verifyToken } from '@/app/lib/auth';
import { query } from '@/app/lib/db';

function generateApiKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
        key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
}

export async function GET(req: Request) {
    try {
        console.log('Fetching API keys for user');
        const user = await verifyToken();
    } catch (e) {
        console.warn(`[server][get][${req.url}]`, e);
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        console.log('Fetching API keys for user');
        const user = await verifyToken();
        console.log('User verified:', user);
    } catch (e) {
        console.warn(`[server][post][${req.url}]`, e);
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }
}
