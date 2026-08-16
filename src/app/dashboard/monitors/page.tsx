import MonitorOverview from '@/components/monitor/MonitorOverview';

export const dynamic = 'force-dynamic';

/**
 * The page component deliberately does not live under `src/pages/` — that
 * directory is still an active Pages Router root, so a file there would also be
 * served at `/Uptime`, as a second uncontrolled entry point.
 */
export default function Page() {
    return <MonitorOverview />;
}
