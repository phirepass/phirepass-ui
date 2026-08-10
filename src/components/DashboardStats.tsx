import { Activity, Server, Wifi, WifiOff } from 'lucide-react';

import { StatTiles } from './StatTiles';
import { TunnelNode } from '@/types/node';

interface DashboardStatsProps {
    nodes: TunnelNode[];
}

const serviceCount = (summary: TunnelNode['services'][string]): number => {
    if (typeof summary === 'number') {
        return summary;
    }
    return summary.count;
};

/**
 * Renders through the shared `StatTiles` rather than its own markup, so this row
 * is exactly the same height as the equivalent row on every other page.
 */
export function DashboardStats({ nodes }: DashboardStatsProps) {
    const online = nodes.filter((n) => n.is_online).length;
    const offline = nodes.length - online;
    const activeServices = nodes
        .filter((node) => node.is_online)
        .reduce(
            (sum, node) => sum + Object.values(node.services).reduce<number>((s, summary) => s + serviceCount(summary), 0),
            0
        );

    return (
        <StatTiles
            tiles={[
                { label: 'Total Nodes', value: nodes.length, icon: Server, tone: 'primary' },
                { label: 'Online', value: online, icon: Wifi, tone: 'success' },
                { label: 'Offline', value: offline, icon: WifiOff, tone: 'danger' },
                { label: 'Active Services', value: activeServices, icon: Activity, tone: 'warning' },
            ]}
        />
    );
}
