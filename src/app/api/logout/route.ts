import { clearAuthCookie, clearCookie, clearMfaChallengeCookie } from '@/app/lib/auth';
import { empty_response } from '@/app/lib/framework';

export async function POST() {
    const cookieDomain =
        process.env.NODE_ENV === 'production'
            ? process.env.COOKIE_DOMAIN || undefined
            : undefined;
    const headers = new Headers();
    headers.append('Set-Cookie', clearAuthCookie(cookieDomain));
    headers.append('Set-Cookie', clearCookie('phirepass_token', cookieDomain));
    // A pending second-factor prompt is part of the sign-in being abandoned.
    headers.append('Set-Cookie', clearMfaChallengeCookie(cookieDomain));
    return empty_response(204, headers);
}
