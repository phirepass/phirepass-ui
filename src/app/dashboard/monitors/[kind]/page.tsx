import { notFound } from 'next/navigation';

import MonitorKindPage from '@/components/monitor/MonitorKindPage';
import { isMonitorKind } from '@/components/monitor/kind-order';

export const dynamic = 'force-dynamic';

/**
 * `/dashboard/monitors/{http|ssl|domain}`.
 *
 * The segment is validated rather than passed through, so an unknown kind 404s
 * instead of rendering an empty list that reads as "you have no monitors".
 */
export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
    const { kind } = await params;

    if (!isMonitorKind(kind)) {
        notFound();
    }

    return <MonitorKindPage kind={kind} />;
}
