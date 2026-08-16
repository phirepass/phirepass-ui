import type { MonitorKind } from '@/types/monitor';

/**
 * The order kinds appear in, on the overview panels and anywhere else they are
 * listed: what the service does, then the two things that quietly expire
 * underneath it.
 */
export const KIND_ORDER: MonitorKind[] = ['http', 'ssl', 'domain'];

/** Whether a path segment names a kind, so a route can 404 rather than guess. */
export function isMonitorKind(value: string): value is MonitorKind {
    return (KIND_ORDER as string[]).includes(value);
}
