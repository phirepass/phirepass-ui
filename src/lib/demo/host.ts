/**
 * A pretend machine behind each demo node: a small filesystem and the facts a
 * shell would report about it.
 *
 * Demo mode used to stop at the node list — opening a shell, a file browser or
 * a desktop asked for a WebSocket token, the demo refused it, and the session
 * died on an error. That is honest, but it is also the exact moment a demo is
 * meant to land. So every demo node now has a host: the terminal, the file
 * browser and the desktop all read and write the *same* one, which is what makes
 * it feel like a machine rather than three canned screens — upload a file in
 * SFTP and `ls` in the shell sees it.
 *
 * No React and no runtime imports, so `host.test.ts` can run it under the bare
 * `node --test` runner. The profile is built from the fixture by
 * `host-profile.ts`; this file only knows what a profile says.
 *
 * Like the rest of the demo, nothing carries a timestamp: a file's age is
 * stored in minutes and turned into a date when it is read.
 */

export type HostPlatform = 'linux' | 'windows' | 'dsm';

export interface HostDisk {
    mount: string;
    fsType: string;
    totalBytes: number;
    usedFraction: number;
}

export interface HostService {
    name: string;
    kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP';
    host: string;
    port: number;
    scheme: 'http' | 'https' | null;
}

/** Everything the host's shell and desktop are allowed to say about it. */
export interface HostProfile {
    nodeId: string;
    hostname: string;
    platform: HostPlatform;
    /** e.g. `Ubuntu 24.04.1 LTS` — the OS without the kernel. */
    osName: string;
    kernel: string;
    arch: string;
    user: string;
    localIp: string;
    cidr: string;
    gatewayIp: string;
    iface: string;
    mac: string;
    publicIp: string;
    city: string;
    uptimeDays: number;
    load: [number, number, number];
    cpuPercent: number;
    cores: number;
    memTotalBytes: number;
    memUsedFraction: number;
    processes: number;
    disks: HostDisk[];
    services: HostService[];
    agentVersion: string;
}

export interface FsFile {
    type: 'file';
    name: string;
    /** Text the file "contains". Absent for a binary, which reports `size` only. */
    content?: string;
    size: number;
    ageMinutes: number;
    mode: string;
}

export interface FsDir {
    type: 'dir';
    name: string;
    children: FsEntry[];
    ageMinutes: number;
    mode: string;
}

export type FsEntry = FsFile | FsDir;

export interface DemoHost {
    profile: HostProfile;
    root: FsDir;
    home: string;
}

const KB = 1024;
const MB = 1024 * KB;

function file(name: string, content: string, ageMinutes: number, mode = '-rw-r--r--'): FsFile {
    return { type: 'file', name, content, size: new TextEncoder().encode(content).length, ageMinutes, mode };
}

function blob(name: string, size: number, ageMinutes: number, mode = '-rw-r--r--'): FsFile {
    return { type: 'file', name, size, ageMinutes, mode };
}

function dir(name: string, children: FsEntry[], ageMinutes = 60 * 24 * 30, mode = 'drwxr-xr-x'): FsDir {
    return { type: 'dir', name, children, ageMinutes, mode };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Normalise a path against `cwd`. Always posix inside: Windows paths are
 * accepted (`C:\Users\x`, backslashes) and stored the same way, and only
 * displayed with a drive letter — see `displayPath`.
 */
export function resolvePath(cwd: string, input: string, home: string): string {
    let raw = input.trim().replace(/\\/g, '/');
    raw = raw.replace(/^[a-zA-Z]:/, '');
    if (raw === '~' || raw.startsWith('~/')) raw = home + raw.slice(1);

    const parts = (raw.startsWith('/') ? raw : `${cwd}/${raw}`).split('/');
    const out: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return '/' + out.join('/');
}

export function displayPath(host: DemoHost, path: string): string {
    if (host.profile.platform === 'windows') {
        return 'C:' + (path === '/' ? '\\' : path.replace(/\//g, '\\'));
    }
    return path;
}

/** `~`-abbreviated, the way a prompt shows it. */
export function promptPath(host: DemoHost, path: string): string {
    if (host.profile.platform === 'windows') return displayPath(host, path);
    if (path === host.home) return '~';
    if (path.startsWith(host.home + '/')) return '~' + path.slice(host.home.length);
    return path;
}

export function lookup(host: DemoHost, path: string): FsEntry | null {
    if (path === '/') return host.root;
    let current: FsEntry = host.root;
    for (const part of path.split('/').filter(Boolean)) {
        if (current.type !== 'dir') return null;
        const next: FsEntry | undefined = current.children.find((child) =>
            host.profile.platform === 'windows'
                ? child.name.toLowerCase() === part.toLowerCase()
                : child.name === part,
        );
        if (!next) return null;
        current = next;
    }
    return current;
}

function parentOf(path: string): { parent: string; name: string } {
    const index = path.lastIndexOf('/');
    return { parent: index <= 0 ? '/' : path.slice(0, index), name: path.slice(index + 1) };
}

// ---------------------------------------------------------------------------
// Mutations — shared by the shell and the file browser
// ---------------------------------------------------------------------------

export type FsResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): FsResult => ({ ok: false, error });

function validName(name: string): boolean {
    return name.length > 0 && name.length <= 255 && !name.includes('/') && name !== '.' && name !== '..';
}

export function makeDir(host: DemoHost, path: string): FsResult {
    const { parent, name } = parentOf(path);
    const target = lookup(host, parent);
    if (!target || target.type !== 'dir') return fail('No such file or directory');
    if (!validName(name)) return fail('Invalid name');
    if (target.children.some((child) => child.name === name)) return fail('File exists');
    target.children.push(dir(name, [], 0));
    target.ageMinutes = 0;
    return { ok: true };
}

/** Creates or replaces a file. `content` omitted makes a binary of `size` bytes. */
export function writeFile(host: DemoHost, path: string, content: string | null, size?: number): FsResult {
    const { parent, name } = parentOf(path);
    const target = lookup(host, parent);
    if (!target || target.type !== 'dir') return fail('No such file or directory');
    if (!validName(name)) return fail('Invalid name');
    const existing = target.children.find((child) => child.name === name);
    if (existing?.type === 'dir') return fail('Is a directory');

    const next = content === null ? blob(name, size ?? 0, 0) : file(name, content, 0);
    if (existing) target.children[target.children.indexOf(existing)] = next;
    else target.children.push(next);
    target.ageMinutes = 0;
    return { ok: true };
}

export function touch(host: DemoHost, path: string): FsResult {
    const existing = lookup(host, path);
    if (existing) {
        existing.ageMinutes = 0;
        return { ok: true };
    }
    return writeFile(host, path, '');
}

export function remove(host: DemoHost, path: string, recursive: boolean): FsResult {
    if (path === '/' || path === host.home) return fail('Operation not permitted');
    const target = lookup(host, parentOf(path).parent);
    const entry = lookup(host, path);
    if (!target || target.type !== 'dir' || !entry) return fail('No such file or directory');
    if (entry.type === 'dir' && !recursive) return fail('Is a directory');
    target.children = target.children.filter((child) => child !== entry);
    target.ageMinutes = 0;
    return { ok: true };
}

export function rename(host: DemoHost, from: string, to: string): FsResult {
    const entry = lookup(host, from);
    if (!entry) return fail('No such file or directory');
    if (from === '/' || from === host.home) return fail('Operation not permitted');
    const source = parentOf(from);
    const dest = parentOf(to);
    const sourceDir = lookup(host, source.parent);
    const destDir = lookup(host, dest.parent);
    if (!sourceDir || sourceDir.type !== 'dir' || !destDir || destDir.type !== 'dir') {
        return fail('No such file or directory');
    }
    if (!validName(dest.name)) return fail('Invalid name');
    if (destDir.children.some((child) => child.name === dest.name && child !== entry)) return fail('File exists');
    if (entry.type === 'dir' && (to + '/').startsWith(from + '/')) return fail('Invalid argument');

    sourceDir.children = sourceDir.children.filter((child) => child !== entry);
    entry.name = dest.name;
    entry.ageMinutes = 0;
    destDir.children.push(entry);
    return { ok: true };
}

/** Directories first, then by name — the order `ls` and the file browser share. */
export function sortedChildren(entry: FsDir): FsEntry[] {
    return [...entry.children].sort((a, b) =>
        a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name),
    );
}

export function entrySize(entry: FsEntry): number {
    return entry.type === 'file' ? entry.size : 4096;
}

export function humanBytes(bytes: number): string {
    if (bytes < KB) return `${bytes} B`;
    const units = ['K', 'M', 'G', 'T'];
    let value = bytes / KB;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
}

// ---------------------------------------------------------------------------
// Building a host
// ---------------------------------------------------------------------------

const HOUR = 60;
const DAY = 24 * HOUR;

function osRelease(profile: HostProfile): string {
    const name = profile.osName;
    const id = /ubuntu/i.test(name) ? 'ubuntu'
        : /alpine/i.test(name) ? 'alpine'
            : /raspberry|debian/i.test(name) ? 'debian'
                : 'linux';
    return [
        `PRETTY_NAME="${name}"`,
        `NAME="${name.split(' ')[0]}"`,
        `ID=${id}`,
        `HOME_URL="https://www.${id === 'alpine' ? 'alpinelinux.org' : id + '.org'}/"`,
        '',
    ].join('\n');
}

function serviceDirs(profile: HostProfile): FsEntry[] {
    const entries: FsEntry[] = [];
    for (const service of profile.services.filter((candidate) => candidate.kind === 'HTTP')) {
        const slug = service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        entries.push(dir(slug, [
            file('docker-compose.yml', [
                'services:',
                `  ${slug}:`,
                `    image: ${slug === 'grafana' ? 'grafana/grafana:11.2.0' : `registry.northwind.io/${slug}:2026.09.3`}`,
                '    restart: unless-stopped',
                '    ports:',
                `      - "${service.host === '0.0.0.0' ? '' : service.host + ':'}${service.port}:${service.port}"`,
                '    env_file: .env',
                '',
            ].join('\n'), 9 * DAY),
            file('.env', `# managed by ansible — do not edit by hand\nLOG_LEVEL=info\nPORT=${service.port}\n`, 9 * DAY, '-rw-------'),
            dir('data', [blob('state.db', 48 * MB + 213 * KB, 7)], 7),
        ], 9 * DAY));
    }
    return entries;
}

function linuxTree(profile: HostProfile): { root: FsDir; home: string } {
    const user = profile.user;
    const home = user === 'root' ? '/root' : `/home/${user}`;
    const services = profile.services.filter((service) => service.kind === 'HTTP');

    const homeDir = dir(home.split('/').pop()!, [
        file('.bashrc', '# ~/.bashrc\nexport EDITOR=vim\nalias ll="ls -alF"\nalias k=kubectl\n', 120 * DAY),
        file('.profile', '# ~/.profile: executed by the login shell\n[ -f ~/.bashrc ] && . ~/.bashrc\n', 120 * DAY),
        dir('.ssh', [
            file('authorized_keys', `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHk2…demo alex@northwind\n`, 60 * DAY, '-rw-------'),
        ], 60 * DAY, 'drwx------'),
        file('README.md', [
            `# ${profile.hostname}`,
            '',
            `Reached through Phirepass — no inbound ports are open on this box.`,
            `The agent (v${profile.agentVersion}) dials out to the relay and holds one WebSocket.`,
            '',
            '## Services',
            ...profile.services.map((service) => `- ${service.name} — ${service.kind.toLowerCase()} on ${service.host}:${service.port}`),
            '',
            '## On call',
            'Page #ops-oncall before restarting anything during trading hours.',
            '',
        ].join('\n'), 14 * DAY),
        dir('deploy', [
            ...serviceDirs(profile),
            file('rollout.sh', '#!/usr/bin/env bash\nset -euo pipefail\ndocker compose pull && docker compose up -d --remove-orphans\n', 21 * DAY, '-rwxr-xr-x'),
        ], 9 * DAY),
        dir('backups', [
            blob('db-2026-09-28.sql.gz', 212 * MB + 4 * KB, 3 * DAY + 2 * HOUR),
            blob('db-2026-09-29.sql.gz', 214 * MB + 610 * KB, 2 * DAY + 2 * HOUR),
            blob('db-2026-09-30.sql.gz', 215 * MB + 88 * KB, DAY + 2 * HOUR),
        ], DAY + 2 * HOUR),
        dir('logs', [
            file('app.log', [
                'INFO  server listening on 127.0.0.1:' + (services[0]?.port ?? 8080),
                'INFO  connected to postgres (pool=16)',
                'WARN  slow query: 812ms SELECT … FROM orders WHERE status = $1',
                'INFO  health check ok (14ms)',
                'INFO  health check ok (12ms)',
                '',
            ].join('\n'), 3),
        ], 3),
    ], 2 * HOUR, 'drwxr-x---');

    const homeParent = user === 'root'
        ? null
        : dir('home', [homeDir]);

    const root = dir('', [
        dir('bin', [], 200 * DAY),
        dir('etc', [
            file('hostname', profile.hostname + '\n', 200 * DAY),
            file('os-release', osRelease(profile), 200 * DAY),
            file('hosts', `127.0.0.1\tlocalhost\n${profile.localIp}\t${profile.hostname}\n`, 200 * DAY),
            dir('phirepass', [
                file('agent.toml', [
                    `server = "wss://relay.phirepass.com"`,
                    `node_id = "${profile.nodeId}"`,
                    '# Ed25519 identity; the private key never leaves this machine',
                    'key_file = "/var/lib/phirepass/node.key"',
                    '',
                ].join('\n'), 40 * DAY, '-rw-r-----'),
            ], 40 * DAY),
        ], 5 * DAY),
        ...(homeParent ? [homeParent] : []),
        dir('opt', [], 90 * DAY),
        ...(user === 'root' ? [homeDir] : [dir('root', [], 90 * DAY, 'drwx------')]),
        dir('srv', [], 90 * DAY),
        dir('tmp', [], 5, 'drwxrwxrwt'),
        dir('usr', [dir('bin', []), dir('lib', []), dir('local', [])], 200 * DAY),
        dir('var', [
            dir('log', [
                file('syslog', [
                    `${profile.hostname} systemd[1]: Started phirepass-agent.service - Phirepass agent.`,
                    `${profile.hostname} phirepass-agent[812]: connected to relay, session established`,
                    `${profile.hostname} phirepass-agent[812]: heartbeat ok`,
                    `${profile.hostname} CRON[20211]: (root) CMD (restic backup --quiet /srv)`,
                    '',
                ].join('\n'), 1, '-rw-r-----'),
                file('auth.log', `${profile.hostname} sshd[2041]: Accepted publickey for ${user} from 127.0.0.1 port 51344 ssh2 (via phirepass)\n`, 1, '-rw-r-----'),
            ], 1),
            dir('lib', [dir('phirepass', [blob('node.key', 64, 40 * DAY, '-rw-------')], 40 * DAY, 'drwx------')]),
        ], 1),
    ], 200 * DAY);

    // The root's own name is empty so that `/` displays as `/`.
    return { root, home };
}

function windowsTree(profile: HostProfile): { root: FsDir; home: string } {
    const user = profile.user;
    const home = `/Users/${user}`;
    const root = dir('', [
        dir('Program Files', [
            dir('Phirepass', [
                blob('phirepass-agent.exe', 14 * MB + 312 * KB, 40 * DAY),
                file('agent.toml', `server = "wss://relay.phirepass.com"\nnode_id = "${profile.nodeId}"\n`, 40 * DAY),
            ], 40 * DAY),
            dir('Microsoft Office', [], 120 * DAY),
        ], 40 * DAY),
        dir('Users', [
            dir(user, [
                dir('Desktop', [
                    file('Lab rules.txt', [
                        'ACME research lab — shared workstation',
                        '',
                        '1. Save your work to D:\\Projects, not the desktop.',
                        '2. Sign out when you are done (Start > your name > Sign out).',
                        '3. The GPU queue is booked through the lab calendar.',
                        '',
                    ].join('\r\n'), 6 * DAY),
                    blob('MATLAB R2026a.lnk', 2 * KB, 30 * DAY),
                ], 6 * DAY),
                dir('Documents', [
                    blob('Thesis draft v7.docx', 1 * MB + 830 * KB, 2 * DAY),
                    blob('Results Q3.xlsx', 412 * KB, 9 * DAY),
                    file('notes.txt', 'Rerun batch 14 with the new seed before Friday.\r\n', 1 * DAY),
                ], DAY),
                dir('Downloads', [
                    blob('cuda_12.6_windows.exe', 3 * 1024 * MB, 20 * DAY),
                ], 20 * DAY),
                dir('Pictures', [blob('rig-setup.jpg', 3 * MB + 120 * KB, 40 * DAY)], 40 * DAY),
            ], DAY),
            dir('Public', [], 120 * DAY),
        ], DAY),
        dir('Windows', [dir('System32', [], 60 * DAY)], 60 * DAY),
    ], 60 * DAY);
    return { root, home };
}

function dsmTree(profile: HostProfile): { root: FsDir; home: string } {
    const user = profile.user;
    const home = `/volume1/homes/${user}`;
    const root = dir('', [
        dir('etc', [file('hostname', profile.hostname + '\n', 200 * DAY)], 200 * DAY),
        dir('volume1', [
            dir('homes', [dir(user, [
                file('README.txt', 'Hyper Backup writes nightly to /volume1/backup. Do not move it.\n', 30 * DAY),
            ], 30 * DAY)], 30 * DAY),
            dir('backup', [
                dir('laptops', [
                    blob('alex-mbp.hbk', 182 * 1024 * MB, 9 * HOUR),
                    blob('reception-pc.hbk', 64 * 1024 * MB, 9 * HOUR),
                ], 9 * HOUR),
            ], 9 * HOUR),
            dir('shared', [
                dir('Finance', [blob('FY2026 budget.xlsx', 680 * KB, 12 * DAY), blob('Invoices 2026-09.zip', 38 * MB, 2 * DAY)], 2 * DAY),
                dir('Marketing', [blob('Brand kit.zip', 412 * MB, 45 * DAY), blob('Launch video final.mp4', 1.6 * 1024 * MB, 15 * DAY)], 15 * DAY),
                dir('Scans', [blob('contract-signed.pdf', 2 * MB + 210 * KB, 4 * DAY)], 4 * DAY),
            ], 2 * DAY),
        ], 9 * HOUR),
    ], 200 * DAY);
    return { root, home };
}

export function createHost(profile: HostProfile): DemoHost {
    const tree = profile.platform === 'windows'
        ? windowsTree(profile)
        : profile.platform === 'dsm'
            ? dsmTree(profile)
            : linuxTree(profile);
    return { profile, ...tree };
}

/**
 * One host per node, for as long as the page lives.
 *
 * Kept on `globalThis` for the same reason the demo store is: a fast-refresh
 * remount must not hand the presenter a fresh disk, and the shell and the file
 * browser must be looking at one machine, not two copies of it.
 */
const HOSTS_KEY = '__phirepassDemoHosts';
type HostsHolder = typeof globalThis & { [HOSTS_KEY]?: Map<string, DemoHost> };

export function hostFor(profile: HostProfile): DemoHost {
    const holder = globalThis as HostsHolder;
    holder[HOSTS_KEY] ??= new Map();
    const hosts = holder[HOSTS_KEY];
    let host = hosts.get(profile.nodeId);
    if (!host) {
        host = createHost(profile);
        hosts.set(profile.nodeId, host);
    }
    return host;
}

/** Turning the demo off forgets every host, so the next demo starts clean. */
export function forgetHosts() {
    (globalThis as HostsHolder)[HOSTS_KEY]?.clear();
}
