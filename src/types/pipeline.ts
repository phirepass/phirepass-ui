/**
 * Pipelines: a schedule, and an ordered list of commands run on agents.
 *
 * Nothing executes these yet — there is no API and no runner. The shapes are
 * written the way the eventual system has to work, so the page is not rewritten
 * when it lands: a pipeline is *definition* (trigger + steps), a run is
 * *history* (one attempt, one result per step), and the two are separate
 * because a definition is edited while its runs stay as they happened.
 *
 * The step is the unit that reaches an agent. Each one names a target and a
 * command; the server resolves the target to node ids at dispatch time and the
 * agent runs the command in its own shell, which is why a step carries a
 * timeout and a failure policy rather than assuming either.
 */

/**
 * What starts a run.
 *
 * A union with one buildable arm on purpose. `webhook` and `node_event` are the
 * two that are already asked for, and the arms exist so the card, the form, and
 * the run list are written against a discriminant from the start instead of
 * assuming every trigger has a cron expression.
 */
export type TriggerKind = 'cron' | 'manual' | 'webhook' | 'node_event';

export interface CronTrigger {
    kind: 'cron';
    /** Standard five-field expression, minute resolution. See `src/lib/cron.ts`. */
    expression: string;
    /** IANA zone the expression is read in — `0 3 * * *` is 03:00 *somewhere*. */
    timezone: string;
}

/** Runs only when someone presses the button. Every pipeline supports this. */
export interface ManualTrigger {
    kind: 'manual';
}

export type PipelineTrigger = CronTrigger | ManualTrigger;

/**
 * Which agents a step runs on.
 *
 * Resolved at dispatch, not at save time: a pipeline that targets a tag should
 * pick up a node added to that tag afterwards, and one that targets a node that
 * is currently offline is not invalid — it is a run that will fail, which is a
 * different thing and reads differently on the card.
 */
export type StepTarget =
    | { kind: 'node'; node_id: string }
    | { kind: 'tag'; tag: string }
    | { kind: 'all' };

/**
 * Where a step's input comes from.
 *
 * The default is the step before it, which is what the connectors on the canvas
 * draw and what most pipelines want. The alternative exists because a pipeline
 * is not always a straight line: after a fork, or after a delivery step whose
 * output is an HTTP status, the value worth working on is two or three steps
 * back, and the workaround without this is a transform whose only job is to
 * carry a value forward.
 */
export type StepInput =
    | { kind: 'previous' }
    | { kind: 'step'; step_id: string };

/** What a failed step does to the rest of the run. */
export type StepFailurePolicy = 'stop' | 'continue';

/**
 * What a step actually does.
 *
 * Three kinds rather than one, because the first pipeline anyone wants is not
 * three shell commands: it is "fetch a feed, reshape it, hand it to somebody
 * else". Forcing that through `curl | jq | curl` would work exactly once — the
 * moment a URL needs a secret header or a parse needs a second line, the shell
 * quoting becomes the feature. So a request is a request, a transform is a
 * script over the previous step's output, and `command` stays for the ops jobs
 * that genuinely are a command on a box.
 *
 * All three run **on an agent**, not on the server: the agent is where the
 * network position is (a feed reachable only on that LAN, a service that
 * allow-lists that address), and it is the only place the server can reach into
 * a private network at all.
 */
export type StepKind = 'command' | 'http' | 'convert' | 'transform' | 'branch';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface StepBase {
    id: string;
    name: string;
    /**
     * Which agents run it. Resolved at dispatch, not at save time: a pipeline
     * targeting a tag should pick up a node added to that tag afterwards, and
     * one targeting a node that is currently offline is not invalid — it is a
     * run that will fail, which is a different thing and reads differently.
     */
    target: StepTarget;
    /** Seconds before the agent kills the step and reports a timeout. */
    timeout_secs: number;
    on_failure: StepFailurePolicy;
}

export interface CommandStep extends StepBase {
    kind: 'command';
    /** Passed to the agent's shell as-is; multi-line is a script. */
    command: string;
    /** Directory the command starts in; `null` means the agent's default. */
    working_dir: string | null;
}

export interface HttpStep extends StepBase {
    kind: 'http';
    method: HttpMethod;
    url: string;
    /** Sent as given. Secrets belong in a store, not here — see the page notice. */
    headers: { name: string; value: string }[];
    /** `null` for methods that carry none. Supports the same references as any field. */
    body: string | null;
}

/**
 * A Lua script over the previous step's output.
 *
 * Lua because the agent is Rust: an embedded interpreter is a crate away, the
 * sandbox is the host's to define rather than the language's to escape, and a
 * transform is a few lines of text that has to run on a Raspberry Pi without
 * shipping a JavaScript runtime to it.
 */
export interface TransformStep extends StepBase {
    kind: 'transform';
    /** The value bound to `input` inside the script. */
    input: StepInput;
    /** Reads `input`, returns this step's output. */
    script: string;
}

/**
 * What a convert step can read.
 *
 * Two formats, because two is what the agent can promise to parse correctly.
 * CSV looks like it belongs here and does not: quoting, delimiters, headers and
 * encodings all have to be configured before it can be read at all, which is a
 * step of its own rather than a third entry in this list.
 */
export type ConvertFormat = 'xml' | 'json';

/**
 * Structured text in, a value the next step can index out.
 *
 * A primitive, not a bundle. "Download an XML document and convert it" is a
 * request followed by a parse, and welding those into one step would mean a
 * second kind the day someone needs the same parse over a file a command
 * printed — and a third when the request needs an auth header the welded
 * version never exposed. The convenience still exists, as a bundle in the
 * library that drops both steps onto the canvas; see `step-bundles.ts`.
 *
 * It exists at all because the alternative is watching people pattern-match
 * against angle brackets in a Lua step, which works until the feed adds an
 * attribute.
 */
export interface ConvertStep extends StepBase {
    kind: 'convert';
    /** The document to read. */
    input: StepInput;
    /** How the document arrives. */
    from: ConvertFormat;
    /**
     * How it leaves.
     *
     * Both ends are stated rather than fixing the output to JSON, because the
     * conversions run in both directions in practice — an XML feed read as JSON
     * on the way in, a JSON payload rendered as XML for the SOAP endpoint
     * nobody has replaced yet. It also makes a same-to-same conversion a
     * legitimate thing to ask for: with a path it is an extraction, which is the
     * cheapest way to pull one field out of a response.
     */
    to: ConvertFormat;
    /**
     * Dotted path into the parsed document; empty means the whole thing.
     *
     * The small piece that makes it usable rather than merely correct: an RSS
     * document is four levels of envelope around the list anybody wants, and
     * `rss.channel.item` skips them.
     */
    root_path: string;
    /**
     * Whether a path that matches once still yields a list.
     *
     * A feed with one entry parses to an object where a feed with two parses to
     * an array, and the step after it then breaks on exactly the quiet days. On
     * by default for that reason.
     */
    always_array: boolean;
}

/** The kinds that actually execute somewhere. */
export type ActionStep = CommandStep | HttpStep | ConvertStep | TransformStep;

/**
 * What one rule looks at.
 *
 * `field` is the one that earns the rest: paired with a convert step it lets a
 * fork test something inside the payload — an item count, a status string, a
 * price — instead of only the mechanics of whether the previous step exited
 * zero. Everything before it is about the step; this is about the data.
 */
export type ConditionSubject =
    | { kind: 'status' }
    | { kind: 'exit_code' }
    | { kind: 'output' }
    | { kind: 'field'; path: string };

/**
 * How a subject is compared.
 *
 * A closed set, and deliberately a small one: every operator here is decidable
 * from a value the runner already holds, needs no evaluation context, and can
 * be read back as an English clause. `matches` is the escape hatch for the
 * cases the others do not cover.
 */
export type ConditionOperator =
    | 'is'
    | 'is_not'
    | 'contains'
    | 'matches'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';

export interface ConditionRule {
    id: string;
    subject: ConditionSubject;
    operator: ConditionOperator;
    /** Ignored by the operators that take no operand. */
    value: string;
}

/** Whether every rule has to hold, or any one of them. */
export type ConditionMatch = 'all' | 'any';

/**
 * A fork in the pipeline: a set of rules, and two sequences.
 *
 * Rules rather than a single test, because "did the last step fail" is the
 * least interesting question a pipeline asks. The real ones are compound — the
 * request succeeded *and* the payload is empty; the exit code is non-zero *or*
 * the output mentions a timeout — and expressing those without a list means
 * nesting forks inside forks until the canvas is unreadable.
 *
 * Kept as a flat list with one combinator rather than a tree of and/or: two
 * levels of grouping is where a condition builder stops being readable at a
 * glance, and a genuinely nested test can still be written as a fork inside a
 * fork, which at least draws itself.
 *
 * The branch carries no target and no timeout because it does not run on an
 * agent — the server evaluates it between dispatches, which is also why it
 * cannot fail on its own.
 */
export interface BranchStep {
    id: string;
    kind: 'branch';
    name: string;
    /** Whose result the rules test; the previous step unless told otherwise. */
    input: StepInput;
    match: ConditionMatch;
    rules: ConditionRule[];
    /** Runs when the rules hold. */
    then: PipelineStep[];
    /** Runs when they do not. May be empty — a branch with one arm is normal. */
    otherwise: PipelineStep[];
}

export type PipelineStep = ActionStep | BranchStep;

/** Narrowing helper, since "does this run on an agent" is asked constantly. */
export function isActionStep(step: PipelineStep): step is ActionStep {
    return step.kind !== 'branch';
}

/**
 * Every step in the tree, in definition order, with its depth.
 *
 * Depth is carried because the flat renderings — the progress bar, the run
 * list — still have to show that a step sits inside a branch rather than on the
 * trunk, and re-deriving that from the tree at each of those call sites is how
 * the two drift apart.
 */
export function flattenSteps(steps: PipelineStep[], depth = 0): { step: PipelineStep; depth: number }[] {
    const flat: { step: PipelineStep; depth: number }[] = [];

    for (const step of steps) {
        flat.push({ step, depth });
        if (step.kind === 'branch') {
            flat.push(...flattenSteps(step.then, depth + 1));
            flat.push(...flattenSteps(step.otherwise, depth + 1));
        }
    }

    return flat;
}

/**
 * How a step names an earlier step's output: `{{ steps.<step id>.output }}`,
 * plus the bare `{{ input }}` for the step immediately before.
 *
 * Substituted by the runner before dispatch, which is why it is a string
 * convention rather than a structured field — the value is not known until the
 * previous step has finished, and every string field a step has can carry one.
 */
export const STEP_REFERENCE_PATTERN = /\{\{\s*(input|steps\.[\w-]+\.output)\s*\}\}/g;

/** Every `{{ ... }}` reference a step's fields make, in the order they appear. */
export function stepReferences(step: PipelineStep): string[] {
    const fields = [step.name];

    // An input bound to a named step is a reference to it, and has to be
    // checked for the same "does that step actually run first" problem as one
    // written by hand into a URL or a body.
    if ((step.kind === 'convert' || step.kind === 'transform' || step.kind === 'branch')
        && step.input.kind === 'step') {
        fields.push(`{{ steps.${step.input.step_id}.output }}`);
    }

    if (step.kind === 'command') {
        fields.push(step.command, step.working_dir ?? '');
    } else if (step.kind === 'http') {
        fields.push(step.url, step.body ?? '', ...step.headers.flatMap((header) => [header.name, header.value]));
    } else if (step.kind === 'transform') {
        fields.push(step.script);
    } else if (step.kind === 'convert') {
        fields.push(step.root_path);
    } else if (step.kind === 'branch') {
        for (const rule of step.rules) {
            fields.push(rule.value);
            if (rule.subject.kind === 'field') fields.push(rule.subject.path);
        }
    }

    const found: string[] = [];
    for (const field of fields) {
        for (const match of field.matchAll(STEP_REFERENCE_PATTERN)) {
            found.push(match[1]);
        }
    }

    return found;
}

/** One rule as an English clause, e.g. `the exit code is at least 400`. */
export function describeRule(rule: ConditionRule): string {
    const subject = describeSubject(rule.subject);

    switch (rule.operator) {
        case 'is_empty':
            return `${subject} is empty`;
        case 'is_not_empty':
            return `${subject} is not empty`;
        case 'is':
            return `${subject} is ${rule.value || '…'}`;
        case 'is_not':
            return `${subject} is not ${rule.value || '…'}`;
        case 'contains':
            return `${subject} contains ${rule.value || '…'}`;
        case 'matches':
            return `${subject} matches /${rule.value}/`;
        case 'greater_than':
            return `${subject} is greater than ${rule.value || '…'}`;
        case 'less_than':
            return `${subject} is less than ${rule.value || '…'}`;
    }
}

export function describeSubject(subject: ConditionSubject): string {
    switch (subject.kind) {
        case 'status':
            return 'the status';
        case 'exit_code':
            return 'the exit code';
        case 'output':
            return 'the output';
        case 'field':
            return subject.path.trim() === '' ? 'a field' : subject.path;
    }
}

/**
 * The whole condition as one sentence.
 *
 * Written out in full on the node rather than summarised as "3 conditions",
 * because a fork that takes the wrong path is the most expensive kind of quiet
 * bug and the only defence is being able to read the test at a glance.
 */
export function describeCondition(step: BranchStep): string {
    if (step.rules.length === 0) return 'nothing is tested yet';

    const clauses = step.rules.map(describeRule);
    const joiner = step.match === 'all' ? ' and ' : ' or ';
    return clauses.join(joiner);
}

export const CONDITION_SUBJECT_LABELS: Record<ConditionSubject['kind'], string> = {
    status: 'Status',
    exit_code: 'Exit code',
    output: 'Output',
    field: 'Field in the output',
};

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
    is: 'is',
    is_not: 'is not',
    contains: 'contains',
    matches: 'matches',
    greater_than: 'is greater than',
    less_than: 'is less than',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
};

/**
 * Which operators a subject can be tested with.
 *
 * A status is one of two words, so ordering it is meaningless; an exit code is
 * a number, so `contains` is. Filtering here keeps the editor from offering
 * comparisons that could never be true.
 */
export function operatorsFor(subject: ConditionSubject): ConditionOperator[] {
    switch (subject.kind) {
        case 'status':
            return ['is', 'is_not'];
        case 'exit_code':
            return ['is', 'is_not', 'greater_than', 'less_than'];
        case 'output':
            return ['contains', 'matches', 'is', 'is_not', 'is_empty', 'is_not_empty'];
        case 'field':
            return [
                'is', 'is_not', 'contains', 'matches',
                'greater_than', 'less_than', 'is_empty', 'is_not_empty',
            ];
    }
}

/** Operators that compare against nothing, so the editor hides the value box. */
export function takesValue(operator: ConditionOperator): boolean {
    return operator !== 'is_empty' && operator !== 'is_not_empty';
}

/** The two words a status rule can be compared with. */
export const STATUS_VALUES = ['succeeded', 'failed'] as const;

/**
 * `draft` is not "disabled" — a draft has never run and is not scheduled, while
 * `paused` keeps its history and resumes on the same schedule. Collapsing the
 * two would lose the distinction between "not finished writing it" and
 * "deliberately switched off".
 */
export type PipelineStatus = 'active' | 'paused' | 'draft';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** A step that never started because an earlier one failed under `stop`. */
export type StepRunStatus = RunStatus | 'skipped';

export interface StepRun {
    step_id: string;
    name: string;
    status: StepRunStatus;
    /** The agent that actually ran it, resolved from the step's target. */
    node_id: string | null;
    node_name: string | null;
    started_at: number | null;
    finished_at: number | null;
    /**
     * A command's exit status, or an HTTP step's response code. `null` while
     * running, and for a step that never started.
     */
    exit_code: number | null;
    /** Combined stdout/stderr, newest last, as the agent streamed it. */
    logs: string[];
    /**
     * How deep in the branch tree this step sits, so a flat run list still
     * shows which arm of a fork actually ran.
     */
    depth?: number;
    /** For a branch: which way it went. */
    taken?: 'then' | 'otherwise';
    /**
     * What this step handed to the next one, truncated for display.
     *
     * Kept apart from `logs` because they answer different questions: the logs
     * are what happened, the output is what the next step received — and when a
     * transform produces the wrong shape, the run reads as a success with a
     * wrong value, which only the output shows.
     */
    output: string | null;
}

export interface PipelineRun {
    id: string;
    pipeline_id: string;
    status: RunStatus;
    /** What started this one — a scheduled run and a hand-pressed one differ. */
    trigger: TriggerKind;
    started_at: number;
    /** `null` while the run is still going. */
    finished_at: number | null;
    steps: StepRun[];
}

export interface Pipeline {
    id: string;
    name: string;
    description: string;
    status: PipelineStatus;
    trigger: PipelineTrigger;
    /** Ordered; the runner walks them front to back. */
    steps: PipelineStep[];
    created_at: number;
    updated_at: number;
    /** Most recent first. Capped to what the detail dialog shows. */
    runs: PipelineRun[];
}

/** What the editor hands back; the id and history belong to whatever stores it. */
export type PipelineDraft = Pick<Pipeline, 'name' | 'description' | 'trigger' | 'steps' | 'status'>;

/**
 * An agent a step can target, as the picker needs it.
 *
 * A projection of the node record the Nodes page already renders, narrowed to
 * the three things choosing a target depends on — is it reachable, what is it
 * called, what is it tagged.
 */
export interface PipelineAgent {
    id: string;
    name: string;
    online: boolean;
    tags: string[];
}

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    draft: 'Draft',
};

export const RUN_STATUS_LABELS: Record<StepRunStatus, string> = {
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
    skipped: 'Skipped',
};

export const STEP_KIND_LABELS: Record<StepKind, string> = {
    command: 'Run a command',
    http: 'HTTP request',
    convert: 'Convert',
    transform: 'Transform',
    branch: 'Condition',
};

/** One line on what each kind is for, shown under the picker in the form. */
export const STEP_KIND_HINTS: Record<StepKind, string> = {
    command: 'A shell command on the agent. Its stdout becomes the step output.',
    http: 'A request made from the agent, so private hosts and allow-listed addresses work.',
    convert: 'Read XML or JSON and hand on the other — or the same, narrowed to a path.',
    transform: 'A Lua script over the previous step output — parse a feed, reshape a payload.',
    branch: 'Split the run in two: one path when a test holds, another when it does not.',
};

export const CONVERT_FORMAT_LABELS: Record<ConvertFormat, string> = {
    xml: 'XML',
    json: 'JSON',
};

export const FAILURE_POLICY_LABELS: Record<StepFailurePolicy, string> = {
    stop: 'Stop the run',
    continue: 'Continue anyway',
};

/** Whether a run is still moving, for the places that poll or animate. */
export function isRunActive(run: PipelineRun): boolean {
    return run.status === 'running' || run.status === 'queued';
}

/** The last finished or in-flight run, or `null` for a pipeline that never ran. */
export function latestRun(pipeline: Pipeline): PipelineRun | null {
    return pipeline.runs[0] ?? null;
}

/** The token a later step writes to reach this step's output. */
export function outputReference(step: PipelineStep): string {
    return `{{ steps.${step.id}.output }}`;
}

/** What a step reads, as a phrase: "the previous step" or a step's name. */
export function describeInput(input: StepInput, steps: PipelineStep[]): string {
    if (input.kind === 'previous') return 'the previous step';

    const source = flattenSteps(steps).find((entry) => entry.step.id === input.step_id);
    return source ? `“${source.step.name}”` : 'a step that no longer exists';
}

/**
 * What a step hands on, as a phrase.
 *
 * Stated per kind rather than left to the reader, because "output" means
 * something different for each: a command's is text on stdout, an HTTP step's
 * is a response body, a convert step's is a value with a shape. A pipeline goes
 * wrong most often where one step's idea of its output meets the next step's
 * idea of its input.
 */
export function describeOutput(step: PipelineStep): string {
    switch (step.kind) {
        case 'command':
            return 'Whatever the command writes to stdout, as text.';
        case 'http':
            return 'The response body, as text. The status becomes the exit code.';
        case 'convert': {
            const at = step.root_path.trim();
            const what = at === '' ? 'the whole document' : at;
            const format = CONVERT_FORMAT_LABELS[step.to];
            return step.always_array
                ? `${format} — a list from ${what}, even when it matches once.`
                : `${format} — the value at ${what}.`;
        }
        case 'transform':
            return 'Whatever the script returns.';
        case 'branch':
            return 'Nothing of its own — each path carries on from the step before the fork.';
    }
}

/** Short human label for a target, e.g. `db-01`, `tag: backup`, `all agents`. */
export function describeTarget(target: StepTarget, agents: PipelineAgent[]): string {
    switch (target.kind) {
        case 'node': {
            const agent = agents.find((entry) => entry.id === target.node_id);
            return agent?.name ?? target.node_id;
        }
        case 'tag':
            return `tag: ${target.tag}`;
        case 'all':
            return 'all agents';
    }
}
