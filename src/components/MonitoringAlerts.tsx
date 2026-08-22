import { AlertStrip, type AlertEntry } from "@/components/AlertStrip";
import { TunnelNode } from "@/types/node";

import { displayedFilesystem, percentUsed } from "./disk-display";

// Higher than the card's own 70/90 tinting on purpose. The bar is glanceable
// context and can afford to colour early; this strip interrupts the page, so it
// should only fire when someone genuinely needs to act.
const DISK_HIGH_PERCENT = 85;
const DISK_CRITICAL_PERCENT = 95;

const CPU_HIGH_PERCENT = 75;
const CPU_CRITICAL_PERCENT = 90;

interface MonitoringAlertsProps {
    nodes: TunnelNode[];
}

/**
 * What the node list has to say about the fleet's health, rendered through the
 * shared `AlertStrip`.
 *
 * It used to draw its own copy of that markup, which had drifted: raw
 * `yellow-500` where the rest of the app uses the `warning` token, and a close
 * button that only appeared if a caller passed `onDismiss` — which none did, so
 * these lines could not be closed at all. Everything below is now just the
 * decision of *what* is worth saying; the strip owns how it looks and how it is
 * dismissed.
 */
function buildAlerts(nodes: TunnelNode[]): AlertEntry[] {
    const alerts: AlertEntry[] = [];

    for (const node of nodes.filter((candidate) => !!candidate.stats)) {
        const label = `${node.name} (${node.stats.host_name})`;

        if (node.stats.host_cpu > CPU_CRITICAL_PERCENT) {
            alerts.push({
                id: `cpu-${node.id}`,
                level: 'error',
                title: 'Critical CPU usage',
                message: `CPU usage at ${node.stats.host_cpu.toFixed(2)}%`,
                tag: label,
            });
        } else if (node.stats.host_cpu > CPU_HIGH_PERCENT) {
            alerts.push({
                id: `cpu-warn-${node.id}`,
                level: 'warning',
                title: 'High CPU usage',
                message: `CPU usage at ${node.stats.host_cpu.toFixed(2)}%`,
                tag: label,
            });
        }

        // Disk pressure, judged per mount rather than on the aggregate. A host
        // with a 4 TB array and a full 2 GB /boot has an aggregate of about 0%
        // and an outage coming, so the fullest single filesystem is what earns
        // the alert — and naming it is most of the value, since "disk is full"
        // without a mount point sends someone hunting.
        //
        // Strictly the mount the node card prints on its face, and never one of
        // the others behind the card's storage dialog: this strip sits above the
        // cards, so a mount it names but no card shows is a number the operator
        // cannot go look at.
        //
        // `null` for agents older than the disk fields and for nodes restored
        // from the local cache, and that must raise nothing: a node that never
        // reported disks is not a node with healthy disks.
        const fullest = displayedFilesystem(node.stats);
        const diskPercent = fullest ? percentUsed(fullest) : 0;

        if (fullest && diskPercent >= DISK_CRITICAL_PERCENT) {
            alerts.push({
                id: `disk-${node.id}`,
                level: 'error',
                title: 'Critical disk usage',
                message: `${fullest.mount} is ${diskPercent.toFixed(1)}% full`,
                tag: label,
            });
        } else if (fullest && diskPercent >= DISK_HIGH_PERCENT) {
            alerts.push({
                id: `disk-warn-${node.id}`,
                level: 'warning',
                title: 'High disk usage',
                message: `${fullest.mount} is ${diskPercent.toFixed(1)}% full`,
                tag: label,
            });
        }
    }

    // Worst first, so the line that needs acting on is the one at the top.
    const severity = { error: 0, warning: 1, info: 2 } as const;
    return alerts.sort((a, b) => severity[a.level] - severity[b.level]);
}

export function MonitoringAlerts({ nodes }: MonitoringAlertsProps) {
    // `AlertStrip` renders nothing for an empty list, which matters here beyond
    // tidiness: the page lays its sections out with `space-y-6`, and a
    // zero-height child still spends a gap, pushing the search bar below where
    // the same row sits on every other page.
    return <AlertStrip alerts={buildAlerts(nodes)} />;
}
