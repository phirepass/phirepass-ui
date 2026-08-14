'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Network, Radio, Server, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AlertStrip, type AlertEntry } from '@/components/AlertStrip';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { FilterChips, SearchBar } from '@/components/SearchBar';
import { StatTiles } from '@/components/StatTiles';
import { can, useCurrentRole } from '@/lib/rbac';
import { createMockServers, latestFleetVersion } from '@/data/mockServers';
import type { ServerInstance, ServerStatus } from '@/types/server';

import { ServerCard } from './ServerCard';
import { ServerDetailDialog } from './ServerDetailDialog';
import { isServing } from './server-display';

const SERVERS_PER_PAGE = 6;

/** Stands in for the round trip a real API would cost, so the loading state is
 *  actually visible while the page is being reviewed. */
const FAKE_LATENCY_MS = 380;

type StatusFilter = 'all' | ServerStatus;

export default function ServersPage() {
    const role = useCurrentRole();
    const canManage = can(role, 'servers:manage');

    const [servers, setServers] = useState<ServerInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);
    const [detailId, setDetailId] = useState<string | null>(null);

    // Seeded after mount rather than in initial state: the records are built
    // relative to the current time, and doing that during render would produce
    // different timestamps on the server than in the browser.
    useEffect(() => {
        let disposed = false;

        const seed = async () => {
            await new Promise((resolve) => { setTimeout(resolve, FAKE_LATENCY_MS); });
            if (disposed) return;
            setServers(createMockServers());
            setLoading(false);
        };

        void seed();
        return () => { disposed = true; };
    }, []);

    const latestVersion = useMemo(() => latestFleetVersion(servers), [servers]);

    const counts = useMemo(() => {
        const tally: Record<ServerStatus, number> = { online: 0, stale: 0, draining: 0, offline: 0 };
        for (const server of servers) {
            tally[server.status] += 1;
        }
        return tally;
    }, [servers]);

    const totals = useMemo(() => servers.reduce(
        (acc, server) => {
            if (isServing(server)) {
                acc.nodes += server.nodes;
                acc.connections += server.connections;
                acc.sessions += server.sessions;
            }
            return acc;
        },
        { nodes: 0, connections: 0, sessions: 0 }
    ), [servers]);

    const alerts = useMemo<AlertEntry[]>(() => {
        const entries: AlertEntry[] = [];

        for (const server of servers) {
            if (server.status === 'offline') {
                entries.push({
                    id: `offline-${server.id}`,
                    level: 'error',
                    title: `${server.fqdn} is not reporting`,
                    message: 'Its registry entry has expired, so the relay can no longer route to it.',
                    tag: server.public_ip,
                });
            } else if (server.status === 'stale') {
                entries.push({
                    id: `stale-${server.id}`,
                    level: 'warning',
                    title: `${server.fqdn} missed its keepalive`,
                    message: 'The instance is still registered but has not refreshed recently.',
                    tag: server.public_ip,
                });
            }

            // Version drift matters operationally: the wire protocol is upgraded
            // in lockstep, so an instance behind the fleet can reject agents that
            // the others accept.
            if (latestVersion && server.version !== latestVersion && server.status !== 'offline') {
                entries.push({
                    id: `version-${server.id}`,
                    level: 'warning',
                    title: `${server.fqdn} is running ${server.version}`,
                    message: `The rest of the fleet is on ${latestVersion}. Agents negotiating against a mixed fleet can fail.`,
                    tag: server.version,
                });
            }
        }

        return entries;
    }, [servers, latestVersion]);

    const filteredServers = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();
        const severity: Record<ServerStatus, number> = { offline: 0, stale: 1, draining: 2, online: 3 };

        return servers
            .filter((server) => filter === 'all' || server.status === filter)
            .filter((server) => {
                if (!needle) return true;
                return (
                    server.fqdn.toLowerCase().includes(needle)
                    || server.id.toLowerCase().includes(needle)
                    || server.public_ip.toLowerCase().includes(needle)
                    || server.private_ip.toLowerCase().includes(needle)
                    || server.host_name.toLowerCase().includes(needle)
                    || (server.location?.city ?? '').toLowerCase().includes(needle)
                    || (server.location?.country ?? '').toLowerCase().includes(needle)
                );
            })
            // Worst first: an instance that needs attention should never be on page 2.
            .sort((a, b) => {
                const delta = severity[a.status] - severity[b.status];
                if (delta !== 0) return delta;
                return a.fqdn.localeCompare(b.fqdn);
            });
    }, [servers, filter, searchQuery]);

    const pageCount = Math.max(1, Math.ceil(filteredServers.length / SERVERS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pagedServers = filteredServers.slice(
        (clampedPage - 1) * SERVERS_PER_PAGE,
        clampedPage * SERVERS_PER_PAGE
    );

    const detailServer = detailId ? servers.find((server) => server.id === detailId) ?? null : null;

    const toggleDrain = (server: ServerInstance) => {
        const draining = server.status === 'draining';
        setServers((prev) => prev.map((entry) => (
            entry.id === server.id
                ? { ...entry, status: draining ? 'online' : 'draining' }
                : entry
        )));
        toast.success(draining
            ? `${server.fqdn} is accepting traffic again`
            : `${server.fqdn} is draining — existing sessions finish, no new nodes`);
    };

    return (
        <div className="container mx-auto space-y-6 px-4 py-6">
            <PageHeader
                title="Servers"
                description="Every relay instance in the fleet, what it is carrying, and where it runs"
                badge={
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
                        dev preview
                    </span>
                }
            />

            {/* Until RBAC exists there is no role to check against, so the page is
                dev-gated and this says plainly who it is meant for. */}
            <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    Administrative view. Once roles ship this page will require the{' '}
                    <span className="font-mono text-xs">servers:read</span> permission, and management
                    actions <span className="font-mono text-xs">servers:manage</span>.
                </p>
            </div>

            <StatTiles
                tiles={[
                    { label: 'Total servers', value: servers.length, icon: Server, tone: 'primary' },
                    { label: 'Online', value: counts.online, icon: Radio, tone: 'success', hint: `${counts.draining} draining` },
                    { label: 'Sessions', value: totals.sessions, icon: Users, tone: 'violet', hint: `${totals.connections} browser clients` },
                    { label: 'Nodes', value: totals.nodes, icon: Network, tone: 'info', hint: 'Across serving instances' },
                ]}
            />

            {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                    <p>Loading servers...</p>
                </div>
            ) : (
                <>
                    <AlertStrip alerts={alerts} />

                    <SearchBar
                        value={searchQuery}
                        onChange={(value) => { setSearchQuery(value); setPage(1); }}
                        placeholder="Search servers..."
                        aria-label="Search servers by hostname, address, or location"
                    >
                        <FilterChips<StatusFilter>
                            label="Filter servers by status"
                            value={filter}
                            onChange={(value) => { setFilter(value); setPage(1); }}
                            options={[
                                { value: 'all', label: 'All', count: servers.length },
                                { value: 'offline', label: 'Offline', count: counts.offline },
                                { value: 'stale', label: 'Stale', count: counts.stale },
                                { value: 'draining', label: 'Draining', count: counts.draining },
                                { value: 'online', label: 'Online', count: counts.online },
                            ]}
                        />
                    </SearchBar>

                    {filteredServers.length === 0 ? (
                        <EmptyState
                            icon={Server}
                            title={servers.length === 0 ? 'No servers registered' : 'No servers match this view'}
                            description={
                                servers.length === 0
                                    ? 'Instances register themselves on startup and disappear when their keepalive lapses.'
                                    : 'Try a different search term or clear the status filter.'
                            }
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {pagedServers.map((server) => (
                                    <ServerCard
                                        key={server.id}
                                        server={server}
                                        latestVersion={latestVersion}
                                        canManage={canManage}
                                        onOpen={(target) => setDetailId(target.id)}
                                        onToggleDrain={toggleDrain}
                                        onViewNodes={(target) => toast.info(
                                            `${target.nodes} node${target.nodes === 1 ? '' : 's'} on ${target.fqdn}`,
                                            { description: 'Filtering the Nodes page by server lands with the real API.' }
                                        )}
                                    />
                                ))}
                            </div>

                            <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
                        </>
                    )}
                </>
            )}

            {alerts.length === 0 && !loading && servers.length > 0 ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Every instance is reporting and on the same version.
                </p>
            ) : null}

            <ServerDetailDialog server={detailServer} onClose={() => setDetailId(null)} />
        </div>
    );
}
