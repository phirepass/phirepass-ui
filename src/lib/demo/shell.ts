/**
 * The demo host's login shell, spoken as a byte stream.
 *
 * `<phirepass-terminal>` is a real xterm.js talking to a real SSH session; in
 * demo mode the session is this. It receives exactly what the widget would
 * have sent the agent — raw keystrokes, escape sequences and all — and answers
 * with what a PTY would have sent back: echo, ANSI colour, cursor movement. So
 * the terminal on screen is the product's own, and only the far end is pretend.
 *
 * Deliberately a shell *impression*, not an emulator: enough of bash (or of
 * PowerShell, on the Windows box) that a presenter can type the commands
 * people actually type in a demo — `ls`, `cd`, `cat`, `htop`, `df -h`,
 * `systemctl status`, `docker ps`, `curl` against a local service — and get an
 * answer consistent with the node card they just clicked. Anything else is
 * "command not found", which is also what a real machine says.
 *
 * Pure apart from one timer (`htop` redraws itself), so `shell.test.ts` drives
 * it under bare `node --test`.
 */

import {
    displayPath,
    entrySize,
    humanBytes,
    lookup,
    makeDir,
    promptPath,
    remove,
    rename,
    resolvePath,
    sortedChildren,
    touch,
    writeFile,
    type DemoHost,
    type FsEntry,
} from './host.ts';

const ESC = '\x1b';
const NL = '\r\n';

const A = {
    reset: `${ESC}[0m`,
    bold: `${ESC}[1m`,
    dim: `${ESC}[2m`,
    red: `${ESC}[31m`,
    green: `${ESC}[32m`,
    yellow: `${ESC}[33m`,
    blue: `${ESC}[34m`,
    magenta: `${ESC}[35m`,
    cyan: `${ESC}[36m`,
    boldGreen: `${ESC}[1;32m`,
    boldBlue: `${ESC}[1;34m`,
    boldCyan: `${ESC}[1;36m`,
    headerBar: `${ESC}[30;42m`,
    footerKey: `${ESC}[0m`,
    footerLabel: `${ESC}[30;46m`,
};

const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g');
const stripAnsi = (text: string) => text.replace(ANSI_PATTERN, '');

// ---------------------------------------------------------------------------
// Processes — what `ps`, `top` and `htop` agree on
// ---------------------------------------------------------------------------

export interface DemoProcess {
    pid: number;
    user: string;
    command: string;
    /** Centre of the CPU wobble, percent of one core. */
    cpu: number;
    /** Resident memory, bytes. */
    rss: number;
    threads: number;
}

/** A process per service, chosen from what the service is called. */
function serviceProcesses(host: DemoHost): DemoProcess[] {
    const user = host.profile.user;
    const list: DemoProcess[] = [];
    let pid = 1840;
    for (const service of host.profile.services.filter((candidate) => candidate.kind === 'HTTP')) {
        const name = service.name.toLowerCase();
        pid += 137;
        if (name.includes('grafana')) {
            list.push({ pid, user: 'grafana', command: '/usr/share/grafana/bin/grafana server --config=/etc/grafana/grafana.ini', cpu: 3.1, rss: 212 * 1024 ** 2, threads: 18 });
        } else if (name.includes('api')) {
            list.push({ pid, user, command: `node /srv/checkout/dist/server.js --port ${service.port}`, cpu: 21.4, rss: 486 * 1024 ** 2, threads: 11 });
            list.push({ pid: pid + 40, user: 'postgres', command: 'postgres: 16/main: checkout checkout 127.0.0.1(51822) idle', cpu: 6.2, rss: 1.2 * 1024 ** 3, threads: 1 });
            list.push({ pid: pid + 41, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /srv/postgres/16/main', cpu: 2.4, rss: 2.1 * 1024 ** 3, threads: 1 });
        } else if (name.includes('kubelet')) {
            list.push({ pid, user: 'root', command: `/usr/local/bin/k3s agent --node-name ${host.profile.hostname}`, cpu: 14.8, rss: 610 * 1024 ** 2, threads: 42 });
            list.push({ pid: pid + 12, user: 'root', command: 'containerd --config /var/lib/rancher/k3s/agent/etc/containerd/config.toml', cpu: 4.1, rss: 140 * 1024 ** 2, threads: 31 });
        } else if (name.includes('till')) {
            list.push({ pid, user, command: `python3 -m till_console --bind 127.0.0.1:${service.port}`, cpu: 2.6, rss: 96 * 1024 ** 2, threads: 6 });
        } else if (name.includes('wms')) {
            list.push({ pid, user, command: 'java -Xmx2g -jar /opt/wms/wms-console.jar', cpu: 11.9, rss: 1.6 * 1024 ** 3, threads: 64 });
        } else if (name === 'dsm') {
            list.push({ pid, user: 'root', command: 'nginx: master process /usr/bin/nginx', cpu: 0.4, rss: 18 * 1024 ** 2, threads: 1 });
            list.push({ pid: pid + 8, user: 'root', command: '/usr/syno/sbin/synoscgi', cpu: 1.1, rss: 64 * 1024 ** 2, threads: 9 });
        } else {
            list.push({ pid, user, command: `/usr/local/bin/${name.replace(/\s+/g, '-')} --port ${service.port}`, cpu: 3.5, rss: 128 * 1024 ** 2, threads: 8 });
        }
    }
    return list;
}

export function processesFor(host: DemoHost): DemoProcess[] {
    const MB = 1024 ** 2;
    return [
        { pid: 1, user: 'root', command: '/sbin/init', cpu: 0.0, rss: 12 * MB, threads: 1 },
        { pid: 412, user: 'root', command: '/usr/lib/systemd/systemd-journald', cpu: 0.1, rss: 38 * MB, threads: 1 },
        { pid: 698, user: 'root', command: '/usr/sbin/cron -f', cpu: 0.0, rss: 3 * MB, threads: 1 },
        { pid: 744, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', cpu: 0.0, rss: 9 * MB, threads: 1 },
        { pid: 812, user: 'root', command: `/usr/local/bin/phirepass-agent start`, cpu: 0.6, rss: 14 * MB, threads: 6 },
        ...serviceProcesses(host),
        { pid: 20412, user: host.profile.user, command: `sshd: ${host.profile.user}@pts/0`, cpu: 0.0, rss: 7 * MB, threads: 1 },
        { pid: 20413, user: host.profile.user, command: '-bash', cpu: 0.0, rss: 5 * MB, threads: 1 },
    ];
}

/**
 * Deterministic wobble: the same second always gives the same reading, so a
 * redraw looks alive without anything being random.
 */
function wobble(seed: number, now: number, spread: number): number {
    const t = now / 2000;
    return Math.sin(t + seed * 1.7) * spread * 0.6 + Math.sin(t * 2.3 + seed) * spread * 0.4;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function uptimeText(host: DemoHost, now: number): string {
    const date = new Date(now);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${host.profile.uptimeDays} days, ${String(hours).padStart(2, ' ')}:${String(minutes).padStart(2, '0')}`;
}

function loadNow(host: DemoHost, now: number): [string, string, string] {
    const [one, five, fifteen] = host.profile.load;
    return [
        Math.max(0, one + wobble(1, now, one * 0.25)).toFixed(2),
        Math.max(0, five + wobble(2, now, five * 0.1)).toFixed(2),
        fifteen.toFixed(2),
    ];
}

// ---------------------------------------------------------------------------
// htop
// ---------------------------------------------------------------------------

function bar(label: string, fraction: number, width: number, text: string, colour: (f: number) => string): string {
    const inner = Math.max(4, width - label.length - 2);
    const filled = Math.round(clamp(fraction, 0, 1) * (inner - text.length));
    const bars = '|'.repeat(Math.max(0, filled));
    const pad = ' '.repeat(Math.max(0, inner - text.length - bars.length));
    return `${A.cyan}${label}${A.reset}${A.bold}[${A.reset}${colour(fraction)}${bars}${A.reset}${pad}${A.dim}${text}${A.reset}${A.bold}]${A.reset}`;
}

const cpuColour = (fraction: number) => (fraction > 0.8 ? A.red : fraction > 0.5 ? A.yellow : A.green);

export function renderHtop(host: DemoHost, cols: number, rows: number, now: number): string {
    const p = host.profile;
    const width = Math.max(60, cols);
    const half = Math.floor((width - 3) / 2);
    const lines: string[] = [];

    const cores = Math.max(1, p.cores);
    const coreLoad = Array.from({ length: cores }, (_, index) =>
        clamp((p.cpuPercent + wobble(index + 3, now, 18)) / 100, 0.01, 0.99));

    const rowsOfCores = Math.ceil(cores / 2);
    for (let row = 0; row < rowsOfCores; row += 1) {
        const left = coreLoad[row];
        const right = coreLoad[row + rowsOfCores];
        const leftLabel = String(row).padStart(3, ' ');
        const segment = (label: string, value: number) =>
            bar(label, value, half, `${(value * 100).toFixed(1)}%`, cpuColour);
        lines.push(
            ` ${segment(leftLabel, left)}` +
            (right !== undefined ? ` ${segment(String(row + rowsOfCores).padStart(3, ' '), right)}` : ''),
        );
    }

    const memUsed = p.memTotalBytes * clamp(p.memUsedFraction + wobble(9, now, 0.01), 0, 1);
    const [l1, l5, l15] = loadNow(host, now);
    const procs = processesFor(host);
    const threads = procs.reduce((sum, proc) => sum + proc.threads, 0) + p.processes;

    lines.push(
        ` ${bar('Mem', memUsed / p.memTotalBytes, half, `${humanBytes(memUsed)}/${humanBytes(p.memTotalBytes)}`, () => A.green)}` +
        `   Tasks: ${A.boldCyan}${p.processes}${A.reset}, ${threads} thr; ${A.boldGreen}2${A.reset} running`,
    );
    lines.push(
        ` ${bar('Swp', 0, half, `0K/${humanBytes(2 * 1024 ** 3)}`, () => A.red)}` +
        `   Load average: ${A.bold}${l1}${A.reset} ${l5} ${A.dim}${l15}${A.reset}`,
    );
    lines.push(` ${' '.repeat(half)}   Uptime: ${A.bold}${uptimeText(host, now)}${A.reset}`);
    lines.push('');

    const header = '    PID USER       PRI  NI  VIRT   RES   SHR S  CPU% MEM%   TIME+  Command';
    lines.push(`${A.headerBar}${header.padEnd(width, ' ')}${A.reset}`);

    const rowsLeft = Math.max(3, rows - lines.length - 1);
    const sorted = procs
        .map((proc, index) => ({ proc, cpu: clamp(proc.cpu + wobble(index + 20, now, Math.max(0.3, proc.cpu * 0.4)), 0, 99.9) }))
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, rowsLeft);

    for (const [index, { proc, cpu }] of sorted.entries()) {
        const mem = (proc.rss / p.memTotalBytes) * 100;
        const minutes = Math.floor((proc.pid * 7 + cpu * 60) % 600);
        const time = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}.${String((proc.pid * 13) % 100).padStart(2, '0')}`;
        const row =
            `${String(proc.pid).padStart(7)} ${proc.user.padEnd(10).slice(0, 10)} ` +
            ` 20   0 ${humanBytes(proc.rss * 2.4).padStart(5)} ${humanBytes(proc.rss).padStart(5)} ${humanBytes(proc.rss * 0.18).padStart(5)} ` +
            `${index === 0 ? `${A.boldGreen}R${A.reset}` : 'S'} ${cpu.toFixed(1).padStart(5)} ${mem.toFixed(1).padStart(4)} ${time.padStart(8)}  `;
        const command = proc.command.slice(0, Math.max(10, width - stripAnsi(row).length));
        const [binary, ...rest] = command.split(' ');
        lines.push(`${row}${index === 0 ? A.boldGreen : A.reset}${binary}${A.reset}${rest.length ? ' ' + A.dim + rest.join(' ') + A.reset : ''}`);
    }

    while (lines.length < rows - 1) lines.push('');

    const keys: [string, string][] = [['F1', 'Help'], ['F2', 'Setup'], ['F3', 'Search'], ['F4', 'Filter'], ['F5', 'Tree'], ['F6', 'SortBy'], ['F9', 'Kill'], ['F10', 'Quit']];
    const footer = keys.map(([key, label]) => `${A.footerKey}${key}${A.footerLabel}${label.padEnd(6)}`).join('');
    lines.push(`${footer}${A.footerLabel}${' '.repeat(Math.max(0, width - keys.reduce((sum, [k]) => sum + k.length + 6, 0)))}${A.reset}`);

    return `${ESC}[H${ESC}[2J` + lines.slice(0, rows).join(NL);
}

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

/** Splits on whitespace, honouring single and double quotes. */
export function tokenize(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let has = false;
    for (const ch of line) {
        if (quote) {
            if (ch === quote) quote = null;
            else current += ch;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            has = true;
        } else if (/\s/.test(ch)) {
            if (current || has) out.push(current);
            current = '';
            has = false;
        } else {
            current += ch;
        }
    }
    if (current || has) out.push(current);
    return out;
}

function splitFlags(args: string[]): { flags: Set<string>; rest: string[] } {
    const flags = new Set<string>();
    const rest: string[] = [];
    for (const arg of args) {
        if (arg.startsWith('--')) flags.add(arg.slice(2));
        else if (arg.startsWith('-') && arg.length > 1) for (const ch of arg.slice(1)) flags.add(ch);
        else rest.push(arg);
    }
    return { flags, rest };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

interface ExecResult {
    out: string;
    code: number;
}

const ok = (out = ''): ExecResult => ({ out, code: 0 });
const err = (out: string, code = 1): ExecResult => ({ out, code });

const LINUX_COMMANDS = [
    'cat', 'cd', 'clear', 'curl', 'date', 'df', 'docker', 'echo', 'exit', 'free', 'grep', 'head', 'help',
    'history', 'hostname', 'htop', 'id', 'ip', 'journalctl', 'less', 'll', 'logout', 'ls', 'mkdir', 'more',
    'mv', 'phirepass-agent', 'ping', 'ps', 'pwd', 'rm', 'sudo', 'systemctl', 'tail', 'top', 'touch', 'uname',
    'uptime', 'wc', 'whoami',
];

const POWERSHELL_COMMANDS = [
    'cat', 'cd', 'clear', 'cls', 'dir', 'echo', 'exit', 'Get-ChildItem', 'Get-Content', 'Get-Location',
    'Get-Process', 'hostname', 'ipconfig', 'ls', 'mkdir', 'pwd', 'Remove-Item', 'Set-Location', 'systeminfo',
    'type', 'whoami',
];

export interface ShellOptions {
    /** Called with everything the far end writes. */
    write: (data: string) => void;
    /** The user typed `exit`. The channel closes the tunnel. */
    onExit: () => void;
    /** Clock, injectable for tests. */
    now?: () => number;
    /** Timer, injectable for tests. Only `htop` uses it. */
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (handle: unknown) => void;
}

export class DemoShell {
    readonly host: DemoHost;
    cwd: string;
    cols = 120;
    rows = 32;

    private line = '';
    private cursor = 0;
    private history: string[] = [];
    private historyIndex = 0;
    private app: { handle: unknown } | null = null;
    private readonly opts: Required<ShellOptions>;
    private readonly windows: boolean;

    constructor(host: DemoHost, options: ShellOptions) {
        this.host = host;
        this.cwd = host.home;
        this.windows = host.profile.platform === 'windows';
        this.opts = {
            now: () => Date.now(),
            setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
            clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
            ...options,
        };
    }

    // --- output --------------------------------------------------------------

    private prompt(): string {
        if (this.windows) return `PS ${displayPath(this.host, this.cwd)}> `;
        const p = this.host.profile;
        const sigil = p.user === 'root' ? '#' : '$';
        return `${A.boldGreen}${p.user}@${p.hostname}${A.reset}:${A.boldBlue}${promptPath(this.host, this.cwd)}${A.reset}${sigil} `;
    }

    private redrawLine() {
        const back = this.line.length - this.cursor;
        this.opts.write(`\r${ESC}[2K${this.prompt()}${this.line}${back > 0 ? `${ESC}[${back}D` : ''}`);
    }

    /** The login banner, then the first prompt. */
    start() {
        const p = this.host.profile;
        const now = new Date(this.opts.now());
        const last = new Date(now.getTime() - 26 * 3600_000);
        if (this.windows) {
            this.opts.write(
                `Windows PowerShell${NL}Copyright (C) Microsoft Corporation. All rights reserved.${NL}${NL}` +
                `Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows${NL}${NL}` +
                this.prompt(),
            );
            return;
        }
        const [l1] = loadNow(this.host, now.getTime());
        const rootDisk = p.disks[0];
        const banner = p.platform === 'dsm'
            ? `Synology Inc. ${p.osName}${NL}${NL}`
            : `Welcome to ${p.osName} (GNU/Linux ${p.kernel} ${p.arch})${NL}${NL}` +
            ` * Documentation:  https://help.ubuntu.com${NL}${NL}` +
            `  System information as of ${now.toUTCString()}${NL}${NL}` +
            `  System load:  ${l1.padEnd(18)} Processes:             ${p.processes}${NL}` +
            (rootDisk
                ? `  Usage of /:   ${`${(rootDisk.usedFraction * 100).toFixed(1)}% of ${humanBytes(rootDisk.totalBytes)}`.padEnd(18)} Users logged in:       1${NL}`
                : '') +
            `  Memory usage: ${`${Math.round(p.memUsedFraction * 100)}%`.padEnd(18)} IPv4 address for ${p.iface}: ${p.localIp}${NL}${NL}` +
            `  ${A.green}This machine has no inbound ports open — you are connected through Phirepass.${A.reset}${NL}${NL}`;
        this.opts.write(
            banner +
            `Last login: ${last.toDateString().slice(0, 10)} ${last.toTimeString().slice(0, 8)} ${last.getFullYear()} from 127.0.0.1 via phirepass-agent${NL}` +
            this.prompt(),
        );
    }

    resize(cols: number, rows: number) {
        if (cols > 0) this.cols = cols;
        if (rows > 0) this.rows = rows;
        if (this.app) this.drawApp();
    }

    dispose() {
        if (this.app) this.opts.clearInterval(this.app.handle);
        this.app = null;
    }

    // --- input ---------------------------------------------------------------

    input(data: string) {
        for (let i = 0; i < data.length; i += 1) {
            const ch = data[i];

            if (this.app) {
                if (ch === 'q' || ch === '\x03') this.leaveApp();
                else if (ch === ESC && data.slice(i, i + 5) === `${ESC}[21~`) { this.leaveApp(); i += 4; }
                continue;
            }

            if (ch === ESC && data[i + 1] === '[') {
                let j = i + 2;
                while (j < data.length && !/[A-Za-z~]/.test(data[j])) j += 1;
                this.escape(data.slice(i + 2, j + 1));
                i = j;
                continue;
            }
            if (ch === ESC && data[i + 1] === 'O') { // application cursor keys
                this.escape(data[i + 2] ?? '');
                i += 2;
                continue;
            }

            switch (ch) {
                case '\r':
                case '\n':
                    this.submit();
                    if (ch === '\r' && data[i + 1] === '\n') i += 1;
                    break;
                case '\x7f':
                case '\b':
                    if (this.cursor > 0) {
                        this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
                        this.cursor -= 1;
                        this.redrawLine();
                    }
                    break;
                case '\x03':
                    this.opts.write(`^C${NL}${this.prompt()}`);
                    this.line = '';
                    this.cursor = 0;
                    break;
                case '\x04':
                    if (!this.line) this.run('exit');
                    break;
                case '\x0c':
                    this.opts.write(`${ESC}[H${ESC}[2J`);
                    this.redrawLine();
                    break;
                case '\x15':
                    this.line = this.line.slice(this.cursor);
                    this.cursor = 0;
                    this.redrawLine();
                    break;
                case '\x01':
                    this.cursor = 0;
                    this.redrawLine();
                    break;
                case '\x05':
                    this.cursor = this.line.length;
                    this.redrawLine();
                    break;
                case '\t':
                    this.complete();
                    break;
                default:
                    if (ch >= ' ') {
                        this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor);
                        this.cursor += 1;
                        if (this.cursor === this.line.length) this.opts.write(ch);
                        else this.redrawLine();
                    }
            }
        }
    }

    private escape(sequence: string) {
        switch (sequence) {
            case 'A':
                if (this.historyIndex > 0) {
                    this.historyIndex -= 1;
                    this.line = this.history[this.historyIndex];
                    this.cursor = this.line.length;
                    this.redrawLine();
                }
                break;
            case 'B':
                if (this.historyIndex < this.history.length) {
                    this.historyIndex += 1;
                    this.line = this.history[this.historyIndex] ?? '';
                    this.cursor = this.line.length;
                    this.redrawLine();
                }
                break;
            case 'C':
                if (this.cursor < this.line.length) { this.cursor += 1; this.opts.write(`${ESC}[C`); }
                break;
            case 'D':
                if (this.cursor > 0) { this.cursor -= 1; this.opts.write(`${ESC}[D`); }
                break;
            case 'H':
            case '1~':
                this.cursor = 0;
                this.redrawLine();
                break;
            case 'F':
            case '4~':
                this.cursor = this.line.length;
                this.redrawLine();
                break;
            case '3~':
                if (this.cursor < this.line.length) {
                    this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
                    this.redrawLine();
                }
                break;
        }
    }

    /** Completes the last word against commands (first word) or paths. */
    private complete() {
        const before = this.line.slice(0, this.cursor);
        const match = /(\S*)$/.exec(before);
        const word = match ? match[1] : '';
        const isCommand = before.trim() === word;

        let candidates: string[];
        let prefix = word;
        if (isCommand && !word.includes('/')) {
            candidates = (this.windows ? POWERSHELL_COMMANDS : LINUX_COMMANDS).filter((name) => name.startsWith(word));
        } else {
            const slash = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
            const base = slash >= 0 ? word.slice(0, slash + 1) : '';
            prefix = word.slice(slash + 1);
            const dirPath = resolvePath(this.cwd, base || '.', this.host.home);
            const entry = lookup(this.host, dirPath);
            candidates = entry?.type === 'dir'
                ? sortedChildren(entry)
                    .filter((child) => child.name.startsWith(prefix) && (prefix.startsWith('.') || !child.name.startsWith('.')))
                    .map((child) => child.name + (child.type === 'dir' ? '/' : ''))
                : [];
        }

        if (candidates.length === 0) return;

        if (candidates.length === 1) {
            const [only] = candidates;
            const completion = only.slice(prefix.length) + (only.endsWith('/') ? '' : ' ');
            const escaped = completion.replace(/ (?=.)/g, '\\ ');
            this.line = this.line.slice(0, this.cursor) + escaped + this.line.slice(this.cursor);
            this.cursor += escaped.length;
            this.redrawLine();
            return;
        }

        let common = candidates[0];
        for (const candidate of candidates) {
            while (!candidate.startsWith(common)) common = common.slice(0, -1);
        }
        if (common.length > prefix.length) {
            const extra = common.slice(prefix.length);
            this.line = this.line.slice(0, this.cursor) + extra + this.line.slice(this.cursor);
            this.cursor += extra.length;
            this.redrawLine();
            return;
        }

        this.opts.write(NL + this.columns(candidates.map((name) => name.endsWith('/') ? `${A.boldBlue}${name}${A.reset}` : name)) + NL);
        this.redrawLine();
    }

    private submit() {
        const command = this.line;
        this.line = '';
        this.cursor = 0;
        this.opts.write(NL);
        if (command.trim()) {
            this.history.push(command);
            if (this.history.length > 500) this.history.shift();
        }
        this.historyIndex = this.history.length;
        this.run(command);
    }

    /** Runs a line. Public so a test, or a scripted demo, can drive it directly. */
    run(line: string) {
        const result = this.windows ? this.runPowerShell(line) : this.runBash(line);
        if (result === 'exit') {
            this.opts.write(`logout${NL}`);
            this.opts.onExit();
            return;
        }
        if (result === 'app') return;
        this.opts.write(result + this.prompt());
    }

    // --- bash ----------------------------------------------------------------

    private runBash(line: string): string | 'exit' | 'app' {
        let output = '';
        // `a && b`, `a ; b` — enough sequencing for the commands people type.
        const steps = line.split(/(&&|;)/);
        let lastCode = 0;
        let skip = false;
        for (const step of steps) {
            if (step === '&&') { skip = lastCode !== 0; continue; }
            if (step === ';') { skip = false; continue; }
            if (skip || !step.trim()) continue;

            const outcome = this.runPipeline(step.trim());
            if (outcome === 'exit' || outcome === 'app') return outcome;
            output += outcome.out;
            lastCode = outcome.code;
        }
        return output;
    }

    private runPipeline(text: string): ExecResult | 'exit' | 'app' {
        // Redirection: `cmd > file`, `cmd >> file`.
        const redirect = /\s(>>?)\s*(\S+)\s*$/.exec(text);
        const commandText = redirect ? text.slice(0, redirect.index) : text;

        const stages = commandText.split('|').map((stage) => stage.trim());
        let result = this.exec(tokenize(stages[0]), stages.length > 1 || !!redirect);
        if (result === 'exit' || result === 'app') return result;

        for (const stage of stages.slice(1)) {
            result = this.filter(tokenize(stage), result);
        }

        if (redirect) {
            const path = resolvePath(this.cwd, redirect[2], this.host.home);
            const existing = lookup(this.host, path);
            const previous = redirect[1] === '>>' && existing?.type === 'file' ? existing.content ?? '' : '';
            const written = writeFile(this.host, path, previous + stripAnsi(result.out).replace(/\r\n/g, '\n'));
            return written.ok ? ok() : err(`bash: ${redirect[2]}: ${written.error}${NL}`);
        }
        return result;
    }

    /** `grep`, `head`, `tail` and `wc` on the right of a pipe. */
    private filter(args: string[], input: ExecResult): ExecResult {
        const [name, ...rest] = args;
        const lines = input.out.split(NL);
        if (lines[lines.length - 1] === '') lines.pop();
        const { flags, rest: positional } = splitFlags(rest);
        const join = (selected: string[]) => ok(selected.length ? selected.join(NL) + NL : '');

        switch (name) {
            case 'grep': {
                const pattern = positional[0] ?? '';
                const ignore = flags.has('i');
                const invert = flags.has('v');
                const matches = lines.filter((line) => {
                    const plain = stripAnsi(line);
                    const hit = ignore ? plain.toLowerCase().includes(pattern.toLowerCase()) : plain.includes(pattern);
                    return invert ? !hit : hit;
                });
                return { out: matches.length ? matches.join(NL) + NL : '', code: matches.length ? 0 : 1 };
            }
            case 'head':
            case 'tail': {
                const nArg = rest.find((arg) => /^-?\d+$/.test(arg.replace(/^-n/, ''))) ?? '10';
                const count = Math.abs(parseInt(nArg.replace(/^-n/, '').replace(/^-/, ''), 10)) || 10;
                return join(name === 'head' ? lines.slice(0, count) : lines.slice(-count));
            }
            case 'wc':
                return ok(`${flags.has('l') ? lines.length : `${String(lines.length).padStart(7)} ${String(lines.join(' ').split(/\s+/).filter(Boolean).length).padStart(7)} ${String(stripAnsi(input.out).length).padStart(7)}`}${NL}`);
            case 'less':
            case 'more':
            case 'cat':
                return input;
            case 'sort':
                return join([...lines].sort());
            default:
                return err(`bash: ${name}: command not found${NL}`, 127);
        }
    }

    private columns(names: string[]): string {
        if (names.length === 0) return '';
        const width = Math.max(...names.map((name) => stripAnsi(name).length)) + 2;
        const perRow = Math.max(1, Math.floor(this.cols / width));
        const rows: string[] = [];
        for (let i = 0; i < names.length; i += perRow) {
            rows.push(names.slice(i, i + perRow).map((name) => name + ' '.repeat(width - stripAnsi(name).length)).join('').trimEnd());
        }
        return rows.join(NL);
    }

    private colourName(entry: FsEntry): string {
        if (entry.type === 'dir') return `${A.boldBlue}${entry.name}${A.reset}`;
        if (entry.mode.includes('x')) return `${A.boldGreen}${entry.name}${A.reset}`;
        if (/\.(gz|zip|tar|tgz|xz)$/.test(entry.name)) return `${A.red}${A.bold}${entry.name}${A.reset}`;
        return entry.name;
    }

    private longListing(entries: FsEntry[], now: number, human: boolean): string {
        const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        return entries.map((entry) => {
            const date = new Date(now - entry.ageMinutes * 60_000);
            const parts = fmt.formatToParts(date);
            const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? '';
            const when = `${part('month')} ${part('day').padStart(2, ' ')} ${part('hour')}:${part('minute')}`;
            const owner = entry.name === 'node.key' || entry.name === 'syslog' ? 'root' : this.host.profile.user;
            const size = human ? humanBytes(entrySize(entry)) : String(entrySize(entry));
            return `${entry.mode} ${entry.type === 'dir' ? 2 : 1} ${owner.padEnd(8)} ${owner.padEnd(8)} ${size.padStart(human ? 5 : 10)} ${when} ${this.colourName(entry)}`;
        }).join(NL) + NL;
    }

    private catFile(arg: string, command: string): ExecResult {
        const path = resolvePath(this.cwd, arg, this.host.home);
        const entry = lookup(this.host, path);
        if (!entry) return err(`${command}: ${arg}: No such file or directory${NL}`);
        if (entry.type === 'dir') return err(`${command}: ${arg}: Is a directory${NL}`);
        if (entry.mode.startsWith('-rw-------') && this.host.profile.user !== 'root' && path.startsWith('/var/')) {
            return err(`${command}: ${arg}: Permission denied${NL}`);
        }
        if (entry.content === undefined) return err(`${command}: ${arg}: binary file — not shown in the demo shell${NL}`);
        return ok(entry.content.replace(/\r?\n/g, NL));
    }

    private exec(args: string[], piped: boolean): ExecResult | 'exit' | 'app' {
        if (args.length === 0) return ok();
        let [name, ...rest] = args;
        const p = this.host.profile;
        const now = this.opts.now();

        if (name === 'sudo') {
            if (rest.length === 0) return err(`usage: sudo command${NL}`);
            [name, ...rest] = rest;
        }

        const { flags, rest: positional } = splitFlags(rest);

        switch (name) {
            case 'help':
                return ok(
                    `${A.bold}Sample shell${A.reset} — this demo node is pretend, but the terminal is the real one.${NL}` +
                    `Try: ${['ls -la', 'cd deploy', 'cat README.md', 'htop', 'df -h', 'free -h', 'systemctl status phirepass-agent', 'docker ps', 'phirepass-agent status', `curl localhost:${p.services.find((s) => s.kind === 'HTTP')?.port ?? 8080}`].map((cmd) => `${A.cyan}${cmd}${A.reset}`).join(', ')}${NL}`,
                );
            case 'exit':
            case 'logout':
                return 'exit';
            case 'clear':
                return ok(`${ESC}[H${ESC}[2J`);
            case 'pwd':
                return ok(this.cwd + NL);
            case 'whoami':
                return ok(p.user + NL);
            case 'id':
                return ok(`uid=1000(${p.user}) gid=1000(${p.user}) groups=1000(${p.user}),27(sudo),998(docker)${NL}`);
            case 'hostname':
                return ok((flags.has('I') ? p.localIp : p.hostname) + NL);
            case 'uname':
                return ok((flags.has('a')
                    ? `Linux ${p.hostname} ${p.kernel} #1 SMP PREEMPT_DYNAMIC ${p.arch} GNU/Linux`
                    : flags.has('r') ? p.kernel : 'Linux') + NL);
            case 'date':
                return ok(new Date(now).toString().replace(/ GMT.*$/, ' UTC') + NL);
            case 'uptime': {
                const [l1, l5, l15] = loadNow(this.host, now);
                const time = new Date(now).toTimeString().slice(0, 8);
                return ok(` ${time} up ${uptimeText(this.host, now)},  1 user,  load average: ${l1}, ${l5}, ${l15}${NL}`);
            }
            case 'echo':
                return ok(rest.join(' ').replace(/\$USER/g, p.user).replace(/\$HOME/g, this.host.home).replace(/\$HOSTNAME/g, p.hostname) + NL);
            case 'history':
                return ok(this.history.map((entry, index) => `${String(index + 1).padStart(5)}  ${entry}`).join(NL) + NL);
            case 'cd': {
                const target = resolvePath(this.cwd, positional[0] ?? '~', this.host.home);
                const entry = lookup(this.host, target);
                if (!entry) return err(`bash: cd: ${positional[0]}: No such file or directory${NL}`);
                if (entry.type !== 'dir') return err(`bash: cd: ${positional[0]}: Not a directory${NL}`);
                this.cwd = target;
                return ok();
            }
            case 'll':
            case 'ls': {
                const all = flags.has('a') || name === 'll';
                const long = flags.has('l') || name === 'll' || piped && false;
                const human = flags.has('h');
                const targets = positional.length ? positional : ['.'];
                let out = '';
                for (const target of targets) {
                    const path = resolvePath(this.cwd, target, this.host.home);
                    const entry = lookup(this.host, path);
                    if (!entry) { out += `ls: cannot access '${target}': No such file or directory${NL}`; continue; }
                    if (targets.length > 1) out += `${target}:${NL}`;
                    const entries = entry.type === 'dir'
                        ? sortedChildren(entry).filter((child) => all || !child.name.startsWith('.'))
                        : [entry];
                    if (long) {
                        const total = Math.ceil(entries.reduce((sum, child) => sum + entrySize(child), 0) / 1024);
                        out += `total ${total}${NL}` + this.longListing(entries, now, human);
                    } else if (piped) {
                        out += entries.map((child) => child.name).join(NL) + (entries.length ? NL : '');
                    } else if (entries.length) {
                        out += this.columns(entries.map((child) => this.colourName(child))) + NL;
                    }
                }
                return ok(out);
            }
            case 'cat':
            case 'less':
            case 'more': {
                if (!positional.length) return err(`${name}: missing file operand${NL}`);
                let out = '';
                for (const arg of positional) {
                    const result = this.catFile(arg, name);
                    out += result.out;
                    if (result.code) return { out, code: result.code };
                }
                return ok(out);
            }
            case 'head':
            case 'tail': {
                const file = positional.find((arg) => !/^\d+$/.test(arg));
                if (!file) return err(`${name}: missing file operand${NL}`);
                const result = this.catFile(file, name);
                return result.code ? result : this.filter([name, ...rest.filter((arg) => arg !== file)], result);
            }
            case 'grep': {
                const [pattern, file] = positional;
                if (!pattern || !file) return err(`Usage: grep [OPTION]... PATTERNS [FILE]...${NL}`, 2);
                const result = this.catFile(file, 'grep');
                return result.code ? result : this.filter(['grep', ...rest.filter((arg) => arg !== file)], result);
            }
            case 'wc': {
                const file = positional[0];
                if (!file) return err(`wc: missing file operand${NL}`);
                const result = this.catFile(file, 'wc');
                if (result.code) return result;
                const counted = this.filter(['wc', ...rest.filter((arg) => arg !== file)], result);
                return ok(counted.out.replace(NL, ` ${file}${NL}`));
            }
            case 'mkdir': {
                for (const arg of positional) {
                    const res = makeDir(this.host, resolvePath(this.cwd, arg, this.host.home));
                    if (!res.ok && !(flags.has('p') && res.error === 'File exists')) return err(`mkdir: cannot create directory '${arg}': ${res.error}${NL}`);
                }
                return positional.length ? ok() : err(`mkdir: missing operand${NL}`);
            }
            case 'touch': {
                for (const arg of positional) {
                    const res = touch(this.host, resolvePath(this.cwd, arg, this.host.home));
                    if (!res.ok) return err(`touch: cannot touch '${arg}': ${res.error}${NL}`);
                }
                return positional.length ? ok() : err(`touch: missing file operand${NL}`);
            }
            case 'rm': {
                const recursive = flags.has('r') || flags.has('R');
                for (const arg of positional) {
                    const res = remove(this.host, resolvePath(this.cwd, arg, this.host.home), recursive);
                    if (!res.ok && !flags.has('f')) return err(`rm: cannot remove '${arg}': ${res.error}${NL}`);
                }
                return positional.length ? ok() : err(`rm: missing operand${NL}`);
            }
            case 'mv': {
                const [from, to] = positional;
                if (!from || !to) return err(`mv: missing file operand${NL}`);
                const fromPath = resolvePath(this.cwd, from, this.host.home);
                let toPath = resolvePath(this.cwd, to, this.host.home);
                if (lookup(this.host, toPath)?.type === 'dir') toPath = `${toPath === '/' ? '' : toPath}/${fromPath.split('/').pop()}`;
                const res = rename(this.host, fromPath, toPath);
                return res.ok ? ok() : err(`mv: cannot move '${from}' to '${to}': ${res.error}${NL}`);
            }
            case 'df': {
                const human = flags.has('h');
                const header = `Filesystem      ${human ? ' Size  Used Avail' : '    1K-blocks       Used  Available'} Use% Mounted on`;
                const rows = p.disks.map((disk, index) => {
                    const used = disk.totalBytes * disk.usedFraction;
                    const avail = disk.totalBytes - used;
                    const fs = (index === 0 ? '/dev/sda1' : `/dev/sd${String.fromCharCode(98 + index - 1)}1`).padEnd(15);
                    const sizes = human
                        ? `${humanBytes(disk.totalBytes).padStart(5)} ${humanBytes(used).padStart(5)} ${humanBytes(avail).padStart(5)}`
                        : `${String(Math.round(disk.totalBytes / 1024)).padStart(13)} ${String(Math.round(used / 1024)).padStart(10)} ${String(Math.round(avail / 1024)).padStart(10)}`;
                    return `${fs} ${sizes} ${`${Math.round(disk.usedFraction * 100)}%`.padStart(4)} ${disk.mount}`;
                });
                return ok([header, `tmpfs           ${human ? '  1.6G  1.2M  1.6G' : '      1638400       1228    1637172'}   1% /run`, ...rows].join(NL) + NL);
            }
            case 'free': {
                const human = flags.has('h');
                const total = p.memTotalBytes;
                const used = total * p.memUsedFraction;
                const cache = total * 0.18;
                const free = total - used - cache;
                const f = (bytes: number) => (human ? humanBytes(bytes) + 'i' : String(Math.round(bytes / 1024))).padStart(human ? 11 : 12);
                return ok(
                    `               total        used        free      shared  buff/cache   available${NL}` +
                    `Mem:     ${f(total)} ${f(used)} ${f(free)} ${f(total * 0.004)} ${f(cache)} ${f(total - used)}${NL}` +
                    `Swap:    ${f(2 * 1024 ** 3)} ${f(0)} ${f(2 * 1024 ** 3)}${NL}`,
                );
            }
            case 'ps': {
                const procs = processesFor(this.host);
                const header = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
                return ok([header, ...procs.map((proc) =>
                    `${proc.user.padEnd(10).slice(0, 10)} ${String(proc.pid).padStart(6)} ${proc.cpu.toFixed(1).padStart(4)} ${((proc.rss / p.memTotalBytes) * 100).toFixed(1).padStart(4)} ${String(Math.round(proc.rss * 2.4 / 1024)).padStart(7)} ${String(Math.round(proc.rss / 1024)).padStart(6)} ?        Ss   Sep01   ${String(Math.round(proc.cpu * 3)).padStart(3)}:${String(proc.pid % 60).padStart(2, '0')} ${proc.command}`,
                )].join(NL) + NL);
            }
            case 'top':
            case 'htop':
                if (piped) return ok(stripAnsi(renderHtop(this.host, this.cols, this.rows, now)));
                this.enterApp();
                return 'app';
            case 'systemctl':
                return this.systemctl(positional);
            case 'journalctl': {
                const unit = rest[rest.indexOf('-u') + 1];
                const time = (offset: number) => new Date(now - offset * 60_000).toTimeString().slice(0, 8);
                const day = new Date(now).toDateString().slice(4, 10);
                return ok([
                    `${day} ${time(42)} ${p.hostname} phirepass-agent[812]: heartbeat ok (rtt 38ms)`,
                    `${day} ${time(21)} ${p.hostname} phirepass-agent[812]: heartbeat ok (rtt 41ms)`,
                    `${day} ${time(3)} ${p.hostname} phirepass-agent[812]: tunnel opened: ssh sid=1 user=${p.user}`,
                    `${day} ${time(0)} ${p.hostname} phirepass-agent[812]: heartbeat ok (rtt 37ms)`,
                ].filter((line) => !unit || line.includes(unit.replace('.service', ''))).join(NL) + NL);
            }
            case 'phirepass-agent':
                if (positional[0] === 'version' || flags.has('version')) return ok(`phirepass-agent ${p.agentVersion}${NL}`);
                return ok(
                    `${A.boldGreen}●${A.reset} phirepass-agent ${p.agentVersion} — ${A.green}connected${A.reset}${NL}` +
                    `  relay      wss://relay.phirepass.com (outbound only)${NL}` +
                    `  node id    ${p.nodeId}${NL}` +
                    `  identity   ed25519, key in /var/lib/phirepass/node.key${NL}` +
                    `  session    JWT, renewed every reconnect${NL}` +
                    `  inbound    ${A.bold}none${A.reset} — no listening ports${NL}` +
                    `  services   ${p.services.map((service) => `${service.name} (${service.kind.toLowerCase()} :${service.port})`).join(', ')}${NL}`,
                );
            case 'docker':
                return this.docker(positional);
            case 'ip':
            case 'ifconfig':
                return ok(
                    `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN${NL}    inet 127.0.0.1/8 scope host lo${NL}` +
                    `2: ${p.iface}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP${NL}` +
                    `    link/ether ${p.mac} brd ff:ff:ff:ff:ff:ff${NL}    inet ${p.localIp}/${p.cidr.split('/')[1] ?? '24'} brd ${p.cidr.replace(/0\/\d+$/, '255')} scope global ${p.iface}${NL}`,
                );
            case 'ping': {
                const target = positional[0];
                if (!target) return err(`ping: usage error: Destination address required${NL}`, 2);
                const ip = target === 'localhost' ? '127.0.0.1' : target === p.hostname ? p.localIp : target === 'gateway' ? p.gatewayIp : /^\d/.test(target) ? target : '93.184.215.14';
                const times = [11.8, 12.4, 11.2, 12.9];
                return ok(
                    `PING ${target} (${ip}) 56(84) bytes of data.${NL}` +
                    times.map((ms, index) => `64 bytes from ${ip}: icmp_seq=${index + 1} ttl=57 time=${ms} ms`).join(NL) + NL + NL +
                    `--- ${target} ping statistics ---${NL}4 packets transmitted, 4 received, 0% packet loss, time 3004ms${NL}` +
                    `rtt min/avg/max/mdev = 11.2/12.1/12.9/0.6 ms${NL}`,
                );
            }
            case 'curl':
                return this.curl(positional, flags);
            case 'vim':
            case 'vi':
            case 'nano':
                return err(`${name}: editors are not available in the demo shell — try cat, or upload a file over SFTP${NL}`);
            default:
                return err(`${name}: command not found${NL}`, 127);
        }
    }

    private systemctl(args: string[]): ExecResult {
        const p = this.host.profile;
        const [verb, unitArg] = args;
        const units = ['phirepass-agent', 'ssh', 'cron', 'docker', ...p.services.filter((s) => s.kind === 'HTTP').map((s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))];
        if (!verb || verb === 'list-units') {
            return ok(
                `  UNIT${' '.repeat(28)}LOAD   ACTIVE SUB     DESCRIPTION${NL}` +
                units.map((unit) => `  ${(unit + '.service').padEnd(32)}loaded active running ${unit === 'phirepass-agent' ? 'Phirepass agent' : unit}`).join(NL) +
                `${NL}${NL}${units.length} loaded units listed.${NL}`,
            );
        }
        if (verb === 'status') {
            const unit = (unitArg ?? 'phirepass-agent').replace(/\.service$/, '');
            if (!units.includes(unit)) return err(`Unit ${unit}.service could not be found.${NL}`, 4);
            const since = new Date(this.opts.now() - p.uptimeDays * 86_400_000);
            return ok(
                `${A.boldGreen}●${A.reset} ${unit}.service - ${unit === 'phirepass-agent' ? 'Phirepass agent' : unit}${NL}` +
                `     Loaded: loaded (/etc/systemd/system/${unit}.service; enabled; preset: enabled)${NL}` +
                `     Active: ${A.boldGreen}active (running)${A.reset} since ${since.toUTCString()}; ${p.uptimeDays} days ago${NL}` +
                `   Main PID: ${unit === 'phirepass-agent' ? 812 : 1900 + unit.length * 11} (${unit})${NL}` +
                `      Tasks: 6 (limit: 18945)${NL}     Memory: 14.2M${NL}` +
                (unit === 'phirepass-agent'
                    ? `${NL}${p.hostname} phirepass-agent[812]: connected to relay, session established${NL}${p.hostname} phirepass-agent[812]: heartbeat ok${NL}`
                    : ''),
            );
        }
        if (['restart', 'start', 'stop', 'reload'].includes(verb)) {
            return unitArg ? ok() : err(`Too few arguments.${NL}`);
        }
        return err(`Unknown command verb ${verb}.${NL}`);
    }

    private docker(args: string[]): ExecResult {
        const p = this.host.profile;
        if (args[0] !== 'ps') return err(`docker: '${args[0] ?? ''}' is not supported in the demo shell. Try docker ps.${NL}`);
        const rows = p.services.filter((s) => s.kind === 'HTTP').map((service, index) => {
            const slug = service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const image = slug === 'grafana' ? 'grafana/grafana:11.2.0' : `registry.northwind.io/${slug}:2026.09.3`;
            const id = (0x3fa9c1d2e4b5 + index * 0x1111b3).toString(16).slice(0, 12);
            return `${id}   ${image.padEnd(42)} ${'"/run.sh"'.padEnd(12)} 9 days ago   Up 9 days (healthy)   ${service.host}:${service.port}->${service.port}/tcp   ${slug}`;
        });
        return ok(`CONTAINER ID   IMAGE${' '.repeat(38)}COMMAND      CREATED      STATUS                PORTS                       NAMES${NL}${rows.join(NL)}${rows.length ? NL : ''}`);
    }

    private curl(args: string[], flags: Set<string>): ExecResult {
        const target = args[0];
        if (!target) return err(`curl: try 'curl --help' for more information${NL}`, 2);
        const match = /^(?:https?:\/\/)?(localhost|127\.0\.0\.1|[\w.-]+)(?::(\d+))?(\/\S*)?$/.exec(target);
        const port = match?.[2] ? Number(match[2]) : 80;
        const path = match?.[3] ?? '/';
        const service = this.host.profile.services.find((candidate) => candidate.kind === 'HTTP' && candidate.port === port);
        if (!service) return err(`curl: (7) Failed to connect to ${match?.[1] ?? target} port ${port}: Connection refused${NL}`, 7);
        const body = JSON.stringify({
            status: 'ok',
            service: service.name,
            path,
            version: '2026.09.3',
            uptime_seconds: this.host.profile.uptimeDays * 86_400,
            checks: { database: 'ok', disk: 'ok' },
        }, null, 2).replace(/\n/g, NL);
        const head = flags.has('i') || flags.has('I')
            ? `HTTP/1.1 200 OK${NL}content-type: application/json${NL}x-served-by: ${this.host.profile.hostname}${NL}${NL}`
            : '';
        return ok(head + (flags.has('I') ? '' : body + NL));
    }

    // --- htop ----------------------------------------------------------------

    private drawApp() {
        this.opts.write(renderHtop(this.host, this.cols, this.rows, this.opts.now()));
    }

    private enterApp() {
        this.opts.write(`${ESC}[?1049h${ESC}[?25l`);
        this.drawApp();
        this.app = { handle: this.opts.setInterval(() => this.drawApp(), 1500) };
    }

    private leaveApp() {
        if (!this.app) return;
        this.opts.clearInterval(this.app.handle);
        this.app = null;
        this.opts.write(`${ESC}[?25h${ESC}[?1049l${this.prompt()}`);
    }

    // --- PowerShell ----------------------------------------------------------

    private runPowerShell(line: string): string | 'exit' {
        const args = tokenize(line.trim());
        if (args.length === 0) return '';
        const [raw, ...rest] = args;
        const name = raw.toLowerCase();
        const p = this.host.profile;
        const now = this.opts.now();
        const notFound = `${raw} : The term '${raw}' is not recognized as the name of a cmdlet, function, script file, or operable program.${NL}` +
            `${A.red}At line:1 char:1${A.reset}${NL}${NL}`;

        switch (name) {
            case 'exit':
                return 'exit';
            case 'cls':
            case 'clear':
                return `${ESC}[H${ESC}[2J`;
            case 'whoami':
                return `${p.hostname.toLowerCase()}\\${p.user}${NL}`;
            case 'hostname':
                return p.hostname + NL;
            case 'pwd':
            case 'get-location':
                return `${NL}Path${NL}----${NL}${displayPath(this.host, this.cwd)}${NL}${NL}`;
            case 'cd':
            case 'set-location': {
                const target = resolvePath(this.cwd, rest[0] ?? this.host.home, this.host.home);
                const entry = lookup(this.host, target);
                if (!entry || entry.type !== 'dir') {
                    return `${A.red}Set-Location : Cannot find path '${displayPath(this.host, target)}' because it does not exist.${A.reset}${NL}`;
                }
                this.cwd = target;
                return '';
            }
            case 'ls':
            case 'dir':
            case 'gci':
            case 'get-childitem': {
                const path = resolvePath(this.cwd, rest.find((arg) => !arg.startsWith('-')) ?? '.', this.host.home);
                const entry = lookup(this.host, path);
                if (!entry || entry.type !== 'dir') {
                    return `${A.red}Get-ChildItem : Cannot find path '${displayPath(this.host, path)}' because it does not exist.${A.reset}${NL}`;
                }
                const fmt = (minutes: number) => {
                    const date = new Date(now - minutes * 60_000);
                    return `${date.toLocaleDateString('en-US')}`.padStart(10) + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).padStart(8);
                };
                const rows = sortedChildren(entry).map((child) =>
                    `${(child.type === 'dir' ? 'd-----' : '-a----').padEnd(14)}${fmt(child.ageMinutes).padEnd(22)}${(child.type === 'dir' ? '' : String(child.size)).padStart(14)} ${child.type === 'dir' ? A.boldBlue + child.name + A.reset : child.name}`,
                );
                return `${NL}    Directory: ${displayPath(this.host, path)}${NL}${NL}` +
                    `${'Mode'.padEnd(14)}${'LastWriteTime'.padEnd(22)}${'Length'.padStart(14)} Name${NL}` +
                    `${'----'.padEnd(14)}${'-------------'.padEnd(22)}${'------'.padStart(14)} ----${NL}` +
                    rows.join(NL) + (rows.length ? NL : '') + NL;
            }
            case 'cat':
            case 'type':
            case 'gc':
            case 'get-content': {
                const arg = rest[0];
                if (!arg) return `${A.red}Get-Content : Cannot bind argument to parameter 'Path' because it is null.${A.reset}${NL}`;
                const entry = lookup(this.host, resolvePath(this.cwd, arg, this.host.home));
                if (!entry || entry.type === 'dir') return `${A.red}Get-Content : Cannot find path '${arg}' because it does not exist.${A.reset}${NL}`;
                if (entry.content === undefined) return `${A.red}Get-Content : '${arg}' is a binary file and is not shown in the demo shell.${A.reset}${NL}`;
                return entry.content.replace(/\r?\n/g, NL) + NL;
            }
            case 'mkdir':
            case 'md':
            case 'new-item': {
                const arg = rest.find((value) => !value.startsWith('-') && value.toLowerCase() !== 'directory');
                if (!arg) return '';
                const res = makeDir(this.host, resolvePath(this.cwd, arg, this.host.home));
                return res.ok ? '' : `${A.red}New-Item : ${res.error}${A.reset}${NL}`;
            }
            case 'del':
            case 'rm':
            case 'remove-item': {
                const arg = rest.find((value) => !value.startsWith('-'));
                if (!arg) return '';
                const res = remove(this.host, resolvePath(this.cwd, arg, this.host.home), rest.some((value) => /^-r/i.test(value)));
                return res.ok ? '' : `${A.red}Remove-Item : ${res.error}${A.reset}${NL}`;
            }
            case 'ipconfig':
                return `${NL}Windows IP Configuration${NL}${NL}${NL}Ethernet adapter Ethernet:${NL}${NL}` +
                    `   Connection-specific DNS Suffix  . : lab.acme.local${NL}` +
                    `   IPv4 Address. . . . . . . . . . . : ${p.localIp}${NL}` +
                    `   Subnet Mask . . . . . . . . . . . : 255.255.255.0${NL}` +
                    `   Default Gateway . . . . . . . . . : ${p.gatewayIp}${NL}${NL}`;
            case 'systeminfo':
                return `${NL}Host Name:                 ${p.hostname}${NL}OS Name:                   Microsoft ${p.osName}${NL}` +
                    `OS Version:                ${p.kernel}${NL}System Type:               x64-based PC${NL}` +
                    `Total Physical Memory:     ${Math.round(p.memTotalBytes / 1024 ** 2).toLocaleString('en-US')} MB${NL}` +
                    `System Boot Time:          ${new Date(now - p.uptimeDays * 86_400_000).toLocaleString('en-US')}${NL}${NL}`;
            case 'ps':
            case 'gps':
            case 'get-process': {
                const procs: [string, number, number][] = [
                    ['explorer', 4120, 182], ['MsMpEng', 3012, 240], ['MATLAB', 9244, 2210], ['phirepass-agent', 2210, 16],
                    ['sshd', 2380, 8], ['svchost', 1180, 34], ['TabTip', 7712, 21], ['Teams', 10440, 612],
                ];
                return `${NL}Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName${NL}-------  ------    -----      -----     ------     --  -- -----------${NL}` +
                    procs.map(([proc, id, mb]) => `${String(200 + (id % 900)).padStart(7)} ${String(Math.round(mb / 9)).padStart(7)} ${String(mb * 900).padStart(8)} ${String(mb * 1024).padStart(10)} ${(mb / 7).toFixed(2).padStart(10)} ${String(id).padStart(6)}   1 ${proc}`).join(NL) + NL + NL;
            }
            case 'echo':
            case 'write-output':
                return rest.join(' ') + NL;
            default:
                return notFound;
        }
    }
}
