import { TunnelNode } from "@/types/node";
import { AlertTriangle, XCircle, Info, X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface Alert {
    id: string;
    type: "error" | "warning" | "info";
    title: string;
    message: string;
    nodeId?: string;
    nodeName?: string;
    timestamp: Date;
}

interface MonitoringAlertsProps {
    nodes: TunnelNode[];
    onDismiss?: (alertId: string) => void;
}

function generateAlerts(nodes: TunnelNode[]): Alert[] {
    const alerts: Alert[] = [];

    nodes.filter(node => !!node.stats).forEach((node) => {
        if (node.stats.host_cpu > 90) {
            alerts.push({
                id: `cpu-${node.id}`,
                type: "error",
                title: "Critical CPU Usage",
                message: `CPU usage at ${node.stats.host_cpu}%`,
                nodeId: node.id,
                nodeName: node.stats.host_name,
                timestamp: new Date(),
            });
        } else if (node.stats.host_cpu > 75) {
            alerts.push({
                id: `cpu-warn-${node.id}`,
                type: 'warning',
                title: 'High CPU Usage',
                message: `CPU usage at ${node.stats.host_cpu}%`,
                nodeId: node.id,
                nodeName: node.stats.host_name,
                timestamp: new Date(),
            });
        }

        // High Memory alert
        //if (node.stats.memory > 90) {
            /*
            alerts.push({
                id: `mem-${node.id}`,
                type: 'error',
                title: 'Critical Memory Usage',
                message: `Memory usage at ${node.stats.memory}%`,
                nodeId: node.id,
                nodeName: node.name,
                timestamp: new Date(),
            });
            */
        //} else if (node.stats.memory > 80) {
            /*
            alerts.push({
                id: `mem-warn-${node.id}`,
                type: 'warning',
                title: 'High Memory Usage',
                message: `Memory usage at ${node.stats.memory}%`,
                nodeId: node.id,
                nodeName: node.name,
                timestamp: new Date(),
            });
            */
        //}

        // Offline node alert
        //if (!node.isOnline) {
            /*
            alerts.push({
                id: `offline-${node.id}`,
                type: 'error',
                title: 'Node Offline',
                message: `Last seen: ${node.lastSeen}`,
                nodeId: node.id,
                nodeName: node.name,
                timestamp: new Date(),
            });
            */
        //}

        // High ping alert
        //if (node.stats.ping > 200) {
            /*
            alerts.push({
                id: `ping-${node.id}`,
                type: 'warning',
                title: 'High Latency',
                message: `Ping at ${node.stats.ping}ms`,
                nodeId: node.id,
                nodeName: node.name,
                timestamp: new Date(),
            });
            */
        //}
    });

    return alerts.sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return order[a.type] - order[b.type];
    });
}

export function MonitoringAlerts({ nodes, onDismiss }: MonitoringAlertsProps) {
    const alerts = generateAlerts(nodes);

    if (alerts.length === 0) {
        /*
        return (
            <div className="bg-secondary/30 border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h3 className="font-medium text-foreground">
                        All Systems Operational
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        No active alerts at this time
                    </p>
                </div>
            </div>
        );*/
    }

    return (
        <div className="space-y-2">
            {/*
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    Alerts
                    <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
                        {alerts.length}
                    </span>
                </h3>
            </div>
            */}

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border transition-all",
                            alert.type === "error" &&
                                "bg-destructive/10 border-destructive/30",
                            alert.type === "warning" &&
                                "bg-yellow-500/10 border-yellow-500/30",
                            alert.type === "info" &&
                                "bg-primary/10 border-primary/30"
                        )}
                    >
                        <div
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                alert.type === "error" && "bg-destructive/20",
                                alert.type === "warning" && "bg-yellow-500/20",
                                alert.type === "info" && "bg-primary/20"
                            )}
                        >
                            {alert.type === "error" && (
                                <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            {alert.type === "warning" && (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                            {alert.type === "info" && (
                                <Info className="w-4 h-4 text-primary" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm">
                                    {alert.title}
                                </h4>
                                {alert.nodeName && (
                                    <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                                        {alert.nodeName}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {alert.message}
                            </p>
                        </div>

                        {onDismiss && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => onDismiss(alert.id)}
                            >
                                <X className="w-3 h-3" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
