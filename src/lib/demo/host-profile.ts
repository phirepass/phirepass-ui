import { DEMO_NODE_SPECS, type DemoNodeSpec } from './fixtures';
import { hostFor, type DemoHost, type HostPlatform, type HostProfile } from './host';

/**
 * From a fixture node to the facts its pretend machine reports.
 *
 * Kept apart from `host.ts` so that file stays free of runtime imports and
 * testable under bare `node --test`; this is the one place that knows the
 * fixture's shape.
 */

/** `Ubuntu 24.04.1 LTS (6.8.0-45-generic)` → name and kernel. */
function splitOs(info: string): { osName: string; kernel: string } {
    const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(info);
    return match ? { osName: match[1], kernel: match[2] } : { osName: info, kernel: '6.8.0' };
}

function platformOf(spec: DemoNodeSpec): HostPlatform {
    if (/windows/i.test(spec.host_os_info)) return 'windows';
    if (/synology|dsm/i.test(spec.host_os_info)) return 'dsm';
    return 'linux';
}

function profileOf(spec: DemoNodeSpec, serviceId: string | null): HostProfile {
    const { osName, kernel } = splitOs(spec.host_os_info);
    const service = spec.services.find((candidate) => candidate.id === serviceId);
    // The login is the service's own username — the one the node card shows —
    // falling back to the first service that names one.
    const user = service?.username
        ?? spec.services.find((candidate) => candidate.username)?.username
        ?? 'admin';

    return {
        nodeId: spec.id,
        hostname: spec.host_name,
        platform: platformOf(spec),
        osName,
        kernel,
        arch: /arm64|rpi|aarch64/i.test(spec.host_os_info) ? 'aarch64' : 'x86_64',
        user,
        localIp: spec.host_local_ip,
        cidr: spec.lan.cidr ?? '10.0.0.0/24',
        gatewayIp: spec.lan.gateway_ip ?? '10.0.0.1',
        iface: spec.lan.iface ?? 'eth0',
        mac: spec.host_mac,
        publicIp: spec.location.ip ?? '',
        city: spec.location.city ?? '',
        uptimeDays: spec.uptime_days,
        load: spec.load_average,
        cpuPercent: spec.cpu,
        cores: spec.mem_total_bytes >= 32 * 1024 ** 3 ? 8 : spec.mem_total_bytes >= 8 * 1024 ** 3 ? 4 : 2,
        memTotalBytes: spec.mem_total_bytes,
        memUsedFraction: spec.mem_used,
        processes: spec.processes,
        disks: spec.disks.map((disk) => ({
            mount: disk.mount,
            fsType: disk.fs_type,
            totalBytes: disk.total_bytes,
            usedFraction: disk.used,
        })),
        services: spec.services.map((candidate) => ({
            name: candidate.name ?? candidate.kind,
            kind: candidate.kind,
            host: candidate.host,
            port: candidate.port,
            scheme: candidate.scheme,
        })),
        agentVersion: spec.version,
    };
}

/**
 * The pretend machine behind a demo node, or `null` for a node that is not in
 * the fixture (a real one — which demo mode never puts on screen).
 *
 * One machine per node: the first session to ask decides its login, which is
 * how a real box behaves too — the shell and the file browser of one node are
 * looking at one disk.
 */
export function demoHostFor(nodeId: string, serviceId: string | null): DemoHost | null {
    const spec = DEMO_NODE_SPECS.find((candidate) => candidate.id === nodeId);
    return spec ? hostFor(profileOf(spec, serviceId)) : null;
}
