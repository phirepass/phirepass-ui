import { getPublicRuntimeConfig } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
    return Response.json(getPublicRuntimeConfig(), {
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
