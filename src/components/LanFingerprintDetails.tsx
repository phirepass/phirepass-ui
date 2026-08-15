import { Container as ContainerIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { NodeLanFingerprint } from '@/types/node';

export interface LanFingerprintDetailsProps {
    lan: NodeLanFingerprint | null | undefined;
    /** The node's own address on this segment — not part of the fingerprint,
        but the one field that makes the rest of it legible. */
    localIp?: string;
    /** Masks addresses, matching the card's IP blur. */
    blurred?: boolean;
    className?: string;
}

/**
 * The LAN half of a node's network identity, laid out to match
 * {@link LocationDetails} so the two read as one table split by scope: that one
 * is where the node's traffic comes out, this one is where it starts.
 *
 * Read by the agent from its own routing table at login, so coverage varies by
 * host rather than by provider — a machine with no default route reports none
 * of it. Empty fields are dropped for the same reason they are there: a column
 * of "—" reads as broken.
 */
export function LanFingerprintDetails({
    lan,
    localIp,
    blurred = false,
    className,
}: LanFingerprintDetailsProps) {
    const gatewayIp = (lan?.gateway_ip ?? '').trim();
    const gatewayMac = (lan?.gateway_mac ?? '').trim();
    const cidr = (lan?.cidr ?? '').trim();
    const iface = (lan?.iface ?? '').trim();
    // Tri-state, as on the card: `undefined` means the agent never reported the
    // field, which is not the same claim as `false`.
    const container = typeof lan?.container === 'boolean' ? lan.container : null;
    const trimmedLocalIp = (localIp ?? '').trim();

    const rows = [
        { label: 'Local IP', value: blurred ? '••••••••' : trimmedLocalIp, mono: true },
        { label: 'Subnet', value: blurred ? '••••••••' : cidr, mono: true },
        { label: 'Gateway IP', value: blurred ? '••••••••' : gatewayIp, mono: true },
        { label: 'Gateway MAC', value: blurred ? '••••••••' : gatewayMac, mono: true },
        { label: 'Interface', value: iface, mono: true },
        // Printed even when negative, for the same reason `is_proxy` is: an
        // explicit "No" is an answer, and "is this thing containerised" is a
        // question worth answering outright.
        { label: 'Container', value: container === null ? '' : container ? 'Yes' : 'No' },
    ].filter((row) => !!row.value);

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className={className}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {rows.map((row) => (
                    <div key={row.label} className="min-w-0">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className={cn('truncate text-foreground', row.mono && 'font-mono')}>
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>

            {container ? (
                <p className="mt-3 flex items-center gap-2 rounded-md border border-lime/35 bg-lime/10 px-3 py-2 text-xs text-lime">
                    <ContainerIcon className="h-3.5 w-3.5 shrink-0" />
                    The agent runs inside a container, so this segment is likely the container
                    network rather than the host&apos;s LAN.
                </p>
            ) : null}
        </div>
    );
}
