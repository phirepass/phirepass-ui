import { clearAuthCookie, clearCookie } from '@/app/lib/auth';

export async function POST() {
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g., example.com
  const headers = new Headers();
  headers.append('Set-Cookie', clearAuthCookie(cookieDomain));
  headers.append('Set-Cookie', clearCookie('phirepass_token', cookieDomain));
  return new Response(null, { status: 204, headers });
}
