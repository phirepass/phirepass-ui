import { TunnelNode } from '@/types/node';
import { Server, Wifi, WifiOff, Activity } from 'lucide-react';

interface DashboardStatsProps {
    nodes: TunnelNode[];
}

export function DashboardStats({ nodes }: DashboardStatsProps) {
    const online = nodes.filter((n) => n.is_online).length;
    const offline = nodes.length - online;
    const avgPing = /*Math.round(
    nodes.filter((n) => n.isOnline).reduce((acc, n) => acc + n.stats.ping, 0) / online || 0
  );*/ 0;

    const stats = [
        {
            label: 'Total Nodes',
            value: nodes.length,
            icon: Server,
            color: 'text-primary',
        },
        {
            label: 'Online',
            value: online,
            icon: Wifi,
            color: 'text-success',
        },
        {
            label: 'Offline',
            value: offline,
            icon: WifiOff,
            color: 'text-destructive',
        },
        {
            label: 'Avg Ping',
            value: `${avgPing}ms`,
            icon: Activity,
            color: 'text-warning',
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
                <div
                    key={stat.label}
                    className="gradient-card border border-border rounded-xl p-4 flex items-center gap-4"
                >
                    <div className={`p-3 rounded-lg bg-secondary ${stat.color}`}>
                        <stat.icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
