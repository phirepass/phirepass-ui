import DownloadsPage from '@/components/download/DownloadsPage';

export const dynamic = 'force-dynamic';

/**
 * Remote Fetch across every node the person can see (screens U1, U2). As with
 * Monitors, the component does not live under `src/pages/`, which is still an
 * active Pages Router root and would serve it a second time.
 */
export default function Page() {
    return <DownloadsPage />;
}
