import { clearAuthCookie, clearCookie } from '@/app/lib/auth';
import { empty_response } from '@/app/lib/framework';

export async function POST() {
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g., example.com
    const headers = new Headers();
    headers.append('Set-Cookie', clearAuthCookie(cookieDomain));
    headers.append('Set-Cookie', clearCookie('phirepass_token', cookieDomain));
    return empty_response(204, headers);
}
