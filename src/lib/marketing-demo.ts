/**
 * Sample data for the illustrations on the public pages (landing, login).
 *
 * It lives here rather than inline so the two pages cannot drift into showing
 * different — or invented — versions of the same product. The terminal lines in
 * particular mirror the real agent CLI (`phirepass-agent login`, which prompts
 * for a PAT via rpassword, then `phirepass-agent start`); if that CLI changes,
 * this is the one place to correct.
 */

export const TERMINAL_LINE_TONES = {
    prompt: 'text-accent',
    ok: 'text-success',
    note: 'text-muted-foreground/60',
    /** Column headings in tabular output, e.g. top's process table. */
    header: 'text-foreground/70',
} as const;

export interface TerminalLine {
    tone: keyof typeof TERMINAL_LINE_TONES;
    /** Gutter glyph: a prompt, a tick, or a blank for command output. */
    mark: string;
    text: string;
}

export const AGENT_TERMINAL_LINES: readonly TerminalLine[] = [
    { tone: 'prompt', mark: '$', text: 'phirepass-agent login' },
    { tone: 'note', mark: ' ', text: 'Enter authentication token: ••••••••' },
    { tone: 'ok', mark: '✓', text: 'node registered · ed25519 keypair created' },
    { tone: 'prompt', mark: '$', text: 'phirepass-agent start' },
    { tone: 'ok', mark: '✓', text: 'dialled out to relay · session live' },
    { tone: 'note', mark: ' ', text: 'inbound ports open: 0' },
];

/**
 * A live SSH session, as the browser terminal shows it once the agent above is
 * connected. `top` is the demo because it is the thing a fake terminal cannot
 * fake convincingly: it only looks right if the session has a PTY, which is
 * exactly what the real one has.
 *
 * The rows are column-aligned with spaces, so anything rendering these must set
 * `whitespace-pre` or HTML will collapse the table.
 */
export const SSH_SESSION_LINES: readonly TerminalLine[] = [
    { tone: 'prompt', mark: '$', text: 'top' },
    { tone: 'note', mark: ' ', text: 'top - 14:22:01 up 41 days' },
    { tone: 'note', mark: ' ', text: '%Cpu(s):  4.1 us,  1.2 sy, 94.1 id' },
    { tone: 'header', mark: ' ', text: '  PID USER     %CPU %MEM COMMAND' },
    { tone: 'ok', mark: ' ', text: '  912 grafana   3.7  4.2 grafana' },
    { tone: 'note', mark: ' ', text: ' 1284 postgres  1.1  6.8 postgres' },
    { tone: 'note', mark: ' ', text: '  418 root      0.3  0.9 phirepass-agent' },
];

/**
 * The four tones a day on the uptime strip can take, matching `UptimeStrip`:
 * clean, slow-but-correct, no verdict reached, and a day with a failure.
 */
export const SAMPLE_UPTIME_TONES = {
    up: 'bg-success/80',
    unknown: 'bg-warning/50',
    degraded: 'bg-warning/80',
    down: 'bg-destructive/80',
} as const;

/** One entry per day, oldest first, for the illustrated 30-day strip. */
export const SAMPLE_UPTIME_MONTH: readonly (keyof typeof SAMPLE_UPTIME_TONES)[] = [
    'up', 'up', 'up', 'up', 'up', 'up', 'up', 'degraded', 'up', 'up',
    'up', 'up', 'unknown', 'up', 'up', 'up', 'up', 'down', 'degraded', 'up',
    'up', 'up', 'up', 'up', 'up', 'up', 'degraded', 'up', 'up', 'up',
];
