import {
    flattenSteps,
    type BranchStep,
    type CommandStep,
    type HttpStep,
    type Pipeline,
    type PipelineAgent,
    type PipelineRun,
    type PipelineStatus,
    type PipelineStep,
    type PipelineTrigger,
    type RunStatus,
    type StepRun,
    type StepRunStatus,
    type ConvertStep,
    type StepTarget,
    type TransformStep,
} from '@/types/pipeline';

/**
 * Sample pipelines for the dev-gated Pipelines page.
 *
 * There is no runner and no API: nothing here has ever executed. The records
 * are shaped as a projection of what the server would store — definition,
 * history, and the agent roster the target picker needs — so the page can be
 * pointed at a real endpoint without touching its components.
 *
 * Timestamps derive from a `now` passed in by the caller, so the whole set is
 * built once on mount instead of each component computing its own "3h ago".
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The agents steps can target. A narrowed view of the node records the Nodes
 * page renders — one of them offline on purpose, because a step pointed at an
 * unreachable agent is a state the page has to say something about.
 */
export const MOCK_AGENTS: PipelineAgent[] = [
    { id: 'nd-6a1f', name: 'db-01', online: true, tags: ['postgres', 'backup'] },
    { id: 'nd-2c94', name: 'edge-fra', online: true, tags: ['edge', 'nginx'] },
    { id: 'nd-77b3', name: 'home-assistant', online: true, tags: ['home'] },
    { id: 'nd-0e58', name: 'nas-01', online: false, tags: ['backup', 'storage'] },
    { id: 'nd-b412', name: 'build-runner', online: true, tags: ['ci'] },
];

function agentName(nodeId: string): string {
    return MOCK_AGENTS.find((agent) => agent.id === nodeId)?.name ?? nodeId;
}

/** Defaults every step shares, spelled out once instead of at each call site. */
function base(id: string, name: string, target: StepTarget) {
    return { id, name, target, timeout_secs: 300, on_failure: 'stop' as const };
}

function command(
    id: string,
    name: string,
    commandLine: string,
    target: StepTarget,
    overrides: Partial<CommandStep> = {}
): CommandStep {
    return { ...base(id, name, target), kind: 'command', command: commandLine, working_dir: null, ...overrides };
}

function http(
    id: string,
    name: string,
    method: HttpStep['method'],
    url: string,
    target: StepTarget,
    overrides: Partial<HttpStep> = {}
): HttpStep {
    return { ...base(id, name, target), kind: 'http', method, url, headers: [], body: null, ...overrides };
}

function transform(
    id: string,
    name: string,
    script: string,
    target: StepTarget,
    overrides: Partial<TransformStep> = {}
): TransformStep {
    return { ...base(id, name, target), kind: 'transform', input: { kind: 'previous' }, script, ...overrides };
}

function convert(
    id: string,
    name: string,
    from: ConvertStep['from'],
    to: ConvertStep['to'],
    rootPath: string,
    target: StepTarget,
    overrides: Partial<ConvertStep> = {}
): ConvertStep {
    return {
        ...base(id, name, target),
        kind: 'convert',
        input: { kind: 'previous' },
        from,
        to,
        root_path: rootPath,
        always_array: true,
        ...overrides,
    };
}

/** A fork. Both arms are given, because an empty branch says nothing. */
function branch(
    id: string,
    name: string,
    rules: BranchStep['rules'],
    then: PipelineStep[],
    otherwise: PipelineStep[] = []
): BranchStep {
    return { id, kind: 'branch', name, input: { kind: 'previous' }, match: 'all', rules, then, otherwise };
}

/** One condition, spelled out where the mock reads better than a literal. */
function rule(
    id: string,
    subject: BranchStep['rules'][number]['subject'],
    operator: BranchStep['rules'][number]['operator'],
    value = ''
): BranchStep['rules'][number] {
    return { id, subject, operator, value };
}

/** One step's result inside a run, written the way the mock reads best. */
interface StepOutcome {
    status: StepRunStatus;
    /** Seconds the step took; ignored for skipped and still-running steps. */
    seconds?: number;
    exit_code?: number | null;
    node_id?: string;
    logs?: string[];
    /** What the step handed forward; shown beside the logs in the run view. */
    output?: string;
}

interface RunSpec {
    id: string;
    status: RunStatus;
    trigger: PipelineRun['trigger'];
    /** Hours before `now` the run started. */
    startedHoursAgo: number;
    outcomes: StepOutcome[];
}

function buildRun(pipelineId: string, tree: PipelineStep[], spec: RunSpec, now: number): PipelineRun {
    // A run records the path that actually executed, so the definition is
    // flattened here the way the runner would have walked it.
    const steps = flattenSteps(tree).map((entry) => entry.step);

    const startedAt = now - spec.startedHoursAgo * HOUR_MS;
    let cursor = startedAt;

    const stepRuns: StepRun[] = steps.map((definition, index) => {
        const outcome = spec.outcomes[index] ?? { status: 'skipped' as StepRunStatus };
        const target = definition.kind === 'branch' ? null : definition.target;
        const nodeId = outcome.node_id ?? (target?.kind === 'node' ? target.node_id : null);

        if (outcome.status === 'skipped' || outcome.status === 'queued') {
            return {
                step_id: definition.id,
                name: definition.name,
                status: outcome.status,
                node_id: nodeId,
                node_name: nodeId ? agentName(nodeId) : null,
                started_at: null,
                finished_at: null,
                exit_code: null,
                logs: [],
                output: null,
            };
        }

        const stepStarted = cursor;
        const duration = (outcome.seconds ?? 12) * 1000;
        const running = outcome.status === 'running';
        cursor = stepStarted + duration + 400;

        return {
            step_id: definition.id,
            name: definition.name,
            status: outcome.status,
            node_id: nodeId,
            node_name: nodeId ? agentName(nodeId) : null,
            started_at: stepStarted,
            finished_at: running ? null : stepStarted + duration,
            exit_code: running || outcome.exit_code === null
                ? null
                : outcome.exit_code ?? (outcome.status === 'succeeded' ? 0 : 1),
            logs: outcome.logs ?? [],
            output: running ? null : outcome.output ?? null,
        };
    });

    const finished = spec.status === 'running' || spec.status === 'queued' ? null : cursor;

    return {
        id: spec.id,
        pipeline_id: pipelineId,
        status: spec.status,
        trigger: spec.trigger,
        started_at: startedAt,
        finished_at: finished,
        steps: stepRuns,
    };
}

interface PipelineSpec {
    id: string;
    name: string;
    description: string;
    status: PipelineStatus;
    trigger: PipelineTrigger;
    steps: PipelineStep[];
    createdDaysAgo: number;
    updatedDaysAgo: number;
    runs: RunSpec[];
}

/**
 * Twenty steps, so the page can be judged at the size it will actually reach.
 *
 * Written as a generator rather than twenty literals because the point is the
 * length, not the individual commands — and because a lane, a progress bar and
 * a canvas all have to stay legible at this size, which is the thing worth
 * looking at.
 */
function maintenanceSteps(): PipelineStep[] {
    const edge: StepTarget = { kind: 'node', node_id: 'nd-2c94' };
    const everywhere: StepTarget = { kind: 'all' };

    return [
        command('mt-01', 'Announce the window', 'wall "maintenance window open"', everywhere, { timeout_secs: 30 }),
        command('mt-02', 'Refresh package index', 'apt-get update -qq', everywhere),
        command('mt-03', 'Upgrade packages', 'apt-get -y upgrade', everywhere, { timeout_secs: 1800 }),
        command('mt-04', 'Remove orphaned packages', 'apt-get -y autoremove', everywhere),
        command('mt-05', 'Vacuum the journal', 'journalctl --vacuum-size=200M', everywhere),
        command('mt-06', 'Prune Docker images', 'docker image prune -af --filter until=720h', { kind: 'tag', tag: 'ci' }),
        command('mt-07', 'Rotate agent logs', 'logrotate -f /etc/logrotate.d/phirepass', everywhere),
        command('mt-08', 'Check disk headroom', 'df -h --output=pcent / | tail -1 | tr -dc "0-9"', everywhere),
        transform(
            'mt-09',
            'Read the headroom',
            [
                '-- Fails the pipeline before the reboot if a disk is nearly full.',
                'local used = tonumber(input) or 0',
                'return { used = used, ok = used < 90 }',
            ].join('\n'),
            everywhere,
            { timeout_secs: 15 }
        ),
        http('mt-10', 'Fetch the health endpoint', 'GET', 'https://status.internal/health', edge, { timeout_secs: 30 }),
        transform(
            'mt-11',
            'Parse the health report',
            [
                'local failing = {}',
                'for name in input:gmatch(\'"([%w-]+)":%s*"down"\') do',
                '    failing[#failing + 1] = name',
                'end',
                '',
                'return { failing = failing, count = #failing }',
            ].join('\n'),
            edge,
            { timeout_secs: 15 }
        ),
        branch(
            'mt-12',
            'If anything is still down',
            [
                // Two rules, because either shape of failure matters: the health
                // report says something is down, or it could not be read at all.
                rule('cnd-down', { kind: 'field', path: 'count' }, 'greater_than', '0'),
            ],
            [
                command('mt-13', 'Collect diagnostics', 'journalctl -p err -n 200 > /tmp/maintenance-errors.log', everywhere),
                http(
                    'mt-14',
                    'Raise the alert',
                    'POST',
                    'https://hooks.slack.com/services/T000/B000/YYYY',
                    edge,
                    {
                        headers: [{ name: 'content-type', value: 'application/json' }],
                        body: '{ "text": "Maintenance halted: {{ input }}" }',
                    }
                ),
            ],
            [
                command('mt-15', 'Clear the maintenance flag', 'rm -f /run/maintenance', everywhere, { on_failure: 'continue' }),
            ]
        ),
        command('mt-16', 'Restart the agent', 'systemctl restart phirepass-agent', everywhere, { timeout_secs: 120 }),
        command('mt-17', 'Verify the agent is up', 'systemctl is-active phirepass-agent', everywhere),
        command('mt-18', 'Re-run the smoke test', '/opt/phirepass/smoke.sh', everywhere, { timeout_secs: 300 }),
        command('mt-19', 'Reload the edge', 'nginx -s reload', edge),
        command('mt-20', 'Close the window', 'wall "maintenance window closed"', everywhere, { timeout_secs: 30 }),
    ];
}

/**
 * The RSS digest leads because it is the shape this feature exists for: a
 * schedule, a fetch, a parse, and a delivery to something outside the fleet —
 * three different step kinds carrying one value between them.
 *
 * The rest deliberately cover every state the page renders: a healthy nightly job, a
 * run in flight, a failure that stopped the rest of the run, a paused pipeline
 * that keeps its history, a draft that has never run, a manual-only pipeline
 * with no schedule at all, and one step pointing at an offline agent.
 */
const SPECS: PipelineSpec[] = [
    {
        id: 'pl-rss-digest',
        name: 'Morning RSS digest',
        description: 'Pulls the feed at 06:00, turns the last day of items into a digest, and posts it to Slack.',
        status: 'active',
        trigger: { kind: 'cron', expression: '0 6 * * *', timezone: 'Europe/Berlin' },
        createdDaysAgo: 14,
        updatedDaysAgo: 1,
        steps: [
            http(
                'st-fetch',
                'Download the feed',
                'GET',
                'https://news.ycombinator.com/rss',
                { kind: 'node', node_id: 'nd-2c94' },
                {
                    headers: [{ name: 'user-agent', value: 'phirepass-pipelines/0.1' }],
                    timeout_secs: 60,
                }
            ),
            convert(
                'st-convert',
                'Convert the feed to JSON',
                'xml',
                'json',
                'rss.channel.item',
                { kind: 'node', node_id: 'nd-2c94' },
                { timeout_secs: 30 }
            ),
            transform(
                'st-format',
                'Build the digest',
                [
                    '-- `input` is the item list the parse step produced.',
                    'local lines = {}',
                    '',
                    'for index, item in ipairs(input) do',
                    '    if index > 10 then break end',
                    '    lines[#lines + 1] = string.format("• <%s|%s>", item.link, item.title)',
                    'end',
                    '',
                    'return { count = #lines, text = table.concat(lines, "\\n") }',
                ].join('\n'),
                { kind: 'node', node_id: 'nd-2c94' },
                { timeout_secs: 30 }
            ),
            http(
                'st-deliver',
                'Post the digest',
                'POST',
                'https://hooks.slack.com/services/T000/B000/XXXX',
                { kind: 'node', node_id: 'nd-2c94' },
                {
                    headers: [{ name: 'content-type', value: 'application/json' }],
                    body: '{\n    "text": "*Morning digest* — {{ steps.st-format.output }}"\n}',
                    timeout_secs: 30,
                    on_failure: 'stop',
                }
            ),
            branch(
                'st-delivery-check',
                'If Slack rejected it',
                [
                    // An HTTP step reports its status as the exit code, so "4xx
                    // or worse" is the honest test for "it did not land".
                    rule('cnd-status', { kind: 'exit_code' }, 'greater_than', '399'),
                ],
                [
                    http(
                        'st-fallback',
                        'Fall back to email',
                        'POST',
                        'https://api.resend.com/emails',
                        { kind: 'node', node_id: 'nd-2c94' },
                        {
                            headers: [{ name: 'content-type', value: 'application/json' }],
                            body: '{\n    "to": "me@example.com",\n    "subject": "Morning digest (Slack failed)",\n    "text": "{{ steps.st-format.output }}"\n}',
                            timeout_secs: 30,
                        }
                    ),
                ],
                [
                    command(
                        'st-record',
                        'Record the delivery',
                        'logger -t pipelines "digest delivered"',
                        { kind: 'node', node_id: 'nd-2c94' },
                        { timeout_secs: 15, on_failure: 'continue' }
                    ),
                ]
            ),
        ],
        runs: [
            {
                id: 'run-4833',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 4,
                outcomes: [
                    {
                        status: 'succeeded',
                        seconds: 2,
                        exit_code: 200,
                        logs: [
                            'GET https://news.ycombinator.com/rss',
                            '200 OK in 412ms · 61.2 KiB · content-type: application/rss+xml',
                        ],
                        output: '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Hacker News</title>…',
                    },
                    {
                        status: 'succeeded',
                        seconds: 1,
                        logs: ['parsed 30 <item> elements from rss.channel.item'],
                        output: '[ { "title": "A tiny CDN in 200 lines", "link": "https://…" }, … ]',
                    },
                    {
                        status: 'succeeded',
                        seconds: 1,
                        logs: ['built a digest of 10 items'],
                        output: '{ "count": 10, "text": "• <https://…|A tiny CDN in 200 lines> …" }',
                    },
                    {
                        status: 'succeeded',
                        seconds: 1,
                        exit_code: 200,
                        logs: ['POST https://hooks.slack.com/services/T000/B000/XXXX', '200 OK in 233ms'],
                        output: 'ok',
                    },
                    { status: 'succeeded', seconds: 0, logs: ['200 is below 400 — taking the second path'] },
                    { status: 'skipped' },
                    { status: 'succeeded', seconds: 0, logs: ['logged'] },
                ],
            },
            {
                id: 'run-4808',
                status: 'failed',
                trigger: 'cron',
                startedHoursAgo: 28,
                outcomes: [
                    {
                        status: 'succeeded',
                        seconds: 3,
                        exit_code: 200,
                        logs: ['GET https://news.ycombinator.com/rss', '200 OK in 1.9s · 60.7 KiB'],
                        output: '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>…',
                    },
                    {
                        status: 'succeeded',
                        seconds: 1,
                        logs: ['parsed 30 <item> elements from rss.channel.item'],
                        output: '[ { "title": "Why your DNS is slow", "link": "https://…" }, … ]',
                    },
                    {
                        status: 'succeeded',
                        seconds: 1,
                        logs: ['built a digest of 9 items'],
                        output: '{ "count": 9, "text": "• <https://…|Why your DNS is slow> …" }',
                    },
                    {
                        status: 'failed',
                        seconds: 1,
                        exit_code: 429,
                        logs: [
                            'POST https://hooks.slack.com/services/T000/B000/XXXX',
                            '429 Too Many Requests in 189ms · retry-after: 30',
                            'step failed: response status 429 is not 2xx',
                        ],
                    },
                    { status: 'succeeded', seconds: 0, logs: ['429 is at least 400 — taking the first path'] },
                    {
                        status: 'failed',
                        seconds: 2,
                        exit_code: 401,
                        logs: ['POST https://api.resend.com/emails', '401 Unauthorized — the API key is a placeholder'],
                    },
                    { status: 'skipped' },
                ],
            },
        ],
    },
    {
        id: 'pl-nightly-backup',
        name: 'Nightly database backup',
        description: 'Dumps Postgres, ships the dump to the NAS, and prunes anything older than 30 days.',
        status: 'active',
        trigger: { kind: 'cron', expression: '0 3 * * *', timezone: 'Europe/Berlin' },
        createdDaysAgo: 96,
        updatedDaysAgo: 11,
        steps: [
            command(
                'st-dump',
                'Dump database',
                'pg_dump --format=custom --file=/var/backups/phirepass-$(date +%F).dump phirepass',
                { kind: 'node', node_id: 'nd-6a1f' },
                { timeout_secs: 1800, working_dir: '/var/backups' }
            ),
            command(
                'st-ship',
                'Copy to NAS',
                'rsync -a --remove-source-files /var/backups/ nas-01:/volume1/backups/phirepass/',
                { kind: 'node', node_id: 'nd-6a1f' },
                { timeout_secs: 900 }
            ),
            command(
                'st-prune',
                'Prune old dumps',
                'find /volume1/backups/phirepass -name "*.dump" -mtime +30 -delete',
                { kind: 'tag', tag: 'backup' },
                { on_failure: 'continue' }
            ),
        ],
        runs: [
            {
                id: 'run-4821',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 7,
                outcomes: [
                    {
                        status: 'succeeded',
                        seconds: 96,
                        logs: [
                            'pg_dump: last built-in OID is 16383',
                            'pg_dump: reading extensions',
                            'pg_dump: dumping contents of table "public.nodes"',
                            'wrote /var/backups/phirepass-2026-08-29.dump (412 MiB)',
                        ],
                    },
                    {
                        status: 'succeeded',
                        seconds: 51,
                        logs: [
                            'sending incremental file list',
                            'phirepass-2026-08-29.dump',
                            'sent 432,116,904 bytes  received 35 bytes  8,472,880.18 bytes/sec',
                        ],
                    },
                    {
                        status: 'succeeded',
                        seconds: 3,
                        node_id: 'nd-0e58',
                        logs: ['removed 2 dumps older than 30 days'],
                    },
                ],
            },
            {
                id: 'run-4796',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 31,
                outcomes: [
                    { status: 'succeeded', seconds: 91, logs: ['wrote /var/backups/phirepass-2026-08-28.dump (410 MiB)'] },
                    { status: 'succeeded', seconds: 48, logs: ['sent 430,004,112 bytes'] },
                    { status: 'succeeded', seconds: 2, node_id: 'nd-0e58', logs: ['removed 1 dump older than 30 days'] },
                ],
            },
            {
                id: 'run-4770',
                status: 'succeeded',
                trigger: 'manual',
                startedHoursAgo: 55,
                outcomes: [
                    { status: 'succeeded', seconds: 88, logs: ['wrote /var/backups/phirepass-2026-08-27.dump (409 MiB)'] },
                    { status: 'succeeded', seconds: 46, logs: ['sent 428,551,003 bytes'] },
                    { status: 'succeeded', seconds: 2, node_id: 'nd-0e58', logs: ['nothing to prune'] },
                ],
            },
        ],
    },
    {
        id: 'pl-cert-renewal',
        name: 'Certificate renewal',
        description: 'Renews the edge certificates and reloads nginx only if something actually changed.',
        status: 'active',
        trigger: { kind: 'cron', expression: '30 4 * * 1', timezone: 'UTC' },
        createdDaysAgo: 210,
        updatedDaysAgo: 63,
        steps: [
            command('st-renew', 'Renew certificates', 'certbot renew --quiet --deploy-hook "touch /run/certs-changed"',
                { kind: 'node', node_id: 'nd-2c94' }, { timeout_secs: 600 }),
            command('st-reload', 'Reload nginx', 'test -f /run/certs-changed && nginx -s reload && rm /run/certs-changed',
                { kind: 'node', node_id: 'nd-2c94' }, { on_failure: 'continue' }),
        ],
        runs: [
            {
                id: 'run-4712',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 76,
                outcomes: [
                    { status: 'succeeded', seconds: 21, logs: ['Cert not yet due for renewal', 'No renewals were attempted.'] },
                    { status: 'succeeded', seconds: 1, exit_code: 0, logs: ['nothing to reload'] },
                ],
            },
            {
                id: 'run-4501',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 244,
                outcomes: [
                    { status: 'succeeded', seconds: 34, logs: ['Congratulations, all renewals succeeded'] },
                    { status: 'succeeded', seconds: 1, logs: ['reloaded nginx'] },
                ],
            },
        ],
    },
    {
        id: 'pl-ha-snapshot',
        name: 'Home Assistant snapshot',
        description: 'Takes a full add-on snapshot every six hours and keeps the last eight.',
        status: 'active',
        trigger: { kind: 'cron', expression: '0 */6 * * *', timezone: 'Europe/Berlin' },
        createdDaysAgo: 42,
        updatedDaysAgo: 5,
        steps: [
            command('st-snapshot', 'Create snapshot', 'ha backups new --name "auto-$(date +%F-%H%M)"',
                { kind: 'node', node_id: 'nd-77b3' }, { timeout_secs: 1200 }),
            command('st-rotate', 'Keep the last eight', 'ha backups list --raw-json | jq -r ".data.backups[8:][].slug" | xargs -r -n1 ha backups remove',
                { kind: 'node', node_id: 'nd-77b3' }, { on_failure: 'continue' }),
        ],
        runs: [
            {
                id: 'run-4830',
                status: 'running',
                trigger: 'cron',
                startedHoursAgo: 0.05,
                outcomes: [
                    { status: 'running', seconds: 180, logs: ['Creating backup...', 'Processing add-ons (3/11)'] },
                    { status: 'queued' },
                ],
            },
            {
                id: 'run-4805',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 6,
                outcomes: [
                    { status: 'succeeded', seconds: 214, logs: ['Backup auto-2026-08-29-0000 created (1.8 GiB)'] },
                    { status: 'succeeded', seconds: 4, logs: ['removed 1 backup'] },
                ],
            },
        ],
    },
    {
        id: 'pl-disk-sweep',
        name: 'Log rotation and disk sweep',
        description: 'Rotates journald, clears the Docker build cache, and reports what is left.',
        status: 'active',
        trigger: { kind: 'cron', expression: '15 2 * * *', timezone: 'UTC' },
        createdDaysAgo: 58,
        updatedDaysAgo: 2,
        steps: [
            command('st-journal', 'Vacuum the journal', 'journalctl --vacuum-time=14d', { kind: 'all' }),
            command('st-docker', 'Prune the build cache', 'docker builder prune --force --filter until=168h',
                { kind: 'tag', tag: 'ci' }, { timeout_secs: 600 }),
            command('st-report', 'Report free space', 'df -h / | tail -1', { kind: 'all' }, { on_failure: 'continue' }),
        ],
        runs: [
            {
                id: 'run-4826',
                status: 'failed',
                trigger: 'cron',
                startedHoursAgo: 8,
                outcomes: [
                    { status: 'succeeded', seconds: 7, node_id: 'nd-2c94', logs: ['Vacuuming done, freed 1.1G of archived journals'] },
                    {
                        status: 'failed',
                        seconds: 42,
                        exit_code: 1,
                        node_id: 'nd-b412',
                        logs: [
                            'Deleted build cache objects: 217',
                            'error during connect: Post "http://docker/build/prune": write unix /var/run/docker.sock: no space left on device',
                            'exit status 1',
                        ],
                    },
                    { status: 'skipped' },
                ],
            },
            {
                id: 'run-4801',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 32,
                outcomes: [
                    { status: 'succeeded', seconds: 6, node_id: 'nd-2c94', logs: ['freed 780M'] },
                    { status: 'succeeded', seconds: 38, node_id: 'nd-b412', logs: ['Total reclaimed space: 6.2GB'] },
                    { status: 'succeeded', seconds: 1, node_id: 'nd-2c94', logs: ['/dev/sda1  118G   71G   41G  64% /'] },
                ],
            },
        ],
    },
    {
        id: 'pl-image-prune',
        name: 'Docker image prune',
        description: 'Weekly sweep of untagged images. Paused while the registry mirror is being rebuilt.',
        status: 'paused',
        trigger: { kind: 'cron', expression: '0 5 * * 0', timezone: 'UTC' },
        createdDaysAgo: 130,
        updatedDaysAgo: 9,
        steps: [
            command('st-prune-images', 'Prune dangling images', 'docker image prune --force', { kind: 'tag', tag: 'ci' }),
        ],
        runs: [
            {
                id: 'run-4402',
                status: 'succeeded',
                trigger: 'cron',
                startedHoursAgo: 220,
                outcomes: [{ status: 'succeeded', seconds: 19, node_id: 'nd-b412', logs: ['Total reclaimed space: 2.9GB'] }],
            },
        ],
    },
    {
        id: 'pl-media-restart',
        name: 'Restart media stack',
        description: 'Hand-run recovery for the compose stack. No schedule on purpose.',
        status: 'active',
        trigger: { kind: 'manual' },
        createdDaysAgo: 21,
        updatedDaysAgo: 21,
        steps: [
            command('st-down', 'Stop the stack', 'docker compose down', { kind: 'node', node_id: 'nd-77b3' },
                { working_dir: '/opt/media' }),
            command('st-up', 'Start the stack', 'docker compose up -d', { kind: 'node', node_id: 'nd-77b3' },
                { working_dir: '/opt/media' }),
        ],
        runs: [
            {
                id: 'run-4655',
                status: 'cancelled',
                trigger: 'manual',
                startedHoursAgo: 96,
                outcomes: [
                    { status: 'succeeded', seconds: 8, logs: ['Container media-jellyfin  Removed'] },
                    { status: 'cancelled', seconds: 3, exit_code: null, logs: ['cancelled by dimitrmo'] },
                ],
            },
        ],
    },
    {
        id: 'pl-fleet-maintenance',
        name: 'Quarterly fleet maintenance',
        description: 'The long one. Twenty steps, run by hand on a maintenance window, with a fork if the health check fails.',
        status: 'active',
        trigger: { kind: 'manual' },
        createdDaysAgo: 180,
        updatedDaysAgo: 12,
        steps: maintenanceSteps(),
        runs: [
            {
                id: 'run-4700',
                status: 'succeeded',
                trigger: 'manual',
                startedHoursAgo: 71,
                // One outcome per flattened step; the fork took its second path.
                outcomes: [
                    ...Array.from({ length: 11 }, () => ({ status: 'succeeded' as const, seconds: 14 })),
                    { status: 'succeeded' as const, seconds: 0, logs: ['health check passed — taking the second path'] },
                    { status: 'skipped' as const },
                    { status: 'skipped' as const },
                    { status: 'succeeded' as const, seconds: 3 },
                    ...Array.from({ length: 5 }, () => ({ status: 'succeeded' as const, seconds: 22 })),
                ],
            },
        ],
    },
    {
        id: 'pl-patch-check',
        name: 'Fleet patch check',
        description: 'Draft. Meant to report pending security updates across every agent before it is switched on.',
        status: 'draft',
        trigger: { kind: 'cron', expression: '0 6 * * 2', timezone: 'UTC' },
        createdDaysAgo: 3,
        updatedDaysAgo: 1,
        steps: [
            command('st-refresh', 'Refresh package index', 'apt-get update -qq', { kind: 'all' }, { timeout_secs: 240 }),
            command('st-list', 'List security updates', 'apt-get --just-print upgrade | grep -c "^Inst.*security" || true',
                { kind: 'all' }, { on_failure: 'continue' }),
        ],
        runs: [],
    },
];

export function createMockPipelines(now: number = Date.now()): Pipeline[] {
    return SPECS.map((spec) => ({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        status: spec.status,
        trigger: spec.trigger,
        steps: spec.steps,
        created_at: now - spec.createdDaysAgo * DAY_MS,
        updated_at: now - spec.updatedDaysAgo * DAY_MS,
        runs: spec.runs.map((run) => buildRun(spec.id, spec.steps, run, now)),
    }));
}

/**
 * A run assembled for a pipeline someone just pressed the button on.
 *
 * The page has no runner behind it, so "Run now" produces the first thing a
 * real one would: a queued run, every step waiting, attributed to the person
 * rather than to the schedule.
 */
export function createManualRun(pipeline: Pipeline, now: number = Date.now()): PipelineRun {
    return {
        id: `run-${Math.floor(now / 1000).toString(36)}`,
        pipeline_id: pipeline.id,
        status: 'queued',
        trigger: 'manual',
        started_at: now,
        finished_at: null,
        steps: flattenSteps(pipeline.steps).map(({ step: definition, depth }) => {
            const target = definition.kind === 'branch' ? null : definition.target;
            return {
            step_id: definition.id,
            name: definition.name,
            depth,
            status: 'queued' as StepRunStatus,
            node_id: target?.kind === 'node' ? target.node_id : null,
            node_name: target?.kind === 'node' ? agentName(target.node_id) : null,
            started_at: null,
            finished_at: null,
            exit_code: null,
            logs: [],
            output: null,
            };
        }),
    };
}
