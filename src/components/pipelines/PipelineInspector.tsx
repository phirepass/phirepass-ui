'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, Copy, GitBranch, Hand, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CRON_PRESETS, cronError, describeCron, nextCronRuns } from '@/lib/cron';
import { cn } from '@/lib/utils';
import {
    CONDITION_OPERATOR_LABELS,
    CONDITION_SUBJECT_LABELS,
    CONVERT_FORMAT_LABELS,
    STATUS_VALUES,
    FAILURE_POLICY_LABELS,
    STEP_KIND_HINTS,
    describeCondition,
    describeInput,
    operatorsFor,
    takesValue,
    describeOutput,
    flattenSteps,
    outputReference,
    type ActionStep,
    type BranchStep,
    type ConditionMatch,
    type ConditionOperator,
    type ConditionRule,
    type ConditionSubject,
    type HttpMethod,
    type HttpStep,
    type ConvertFormat,
    type ConvertStep,
    type PipelineAgent,
    type PipelineStep,
    type PipelineTrigger,
    type StepFailurePolicy,
    type StepTarget,
} from '@/types/pipeline';

import { LuaEditor } from './LuaEditor';
import { STEP_KIND_ICONS, formatInZone, formatUntil } from './pipeline-display';
import { browserTimeZone } from './use-pipeline-editor';

/** Zones offered without typing. The browser's own is prepended at render. */
const COMMON_TIMEZONES = [
    'UTC',
    'Europe/Berlin',
    'Europe/London',
    'Europe/Athens',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Singapore',
    'Australia/Sydney',
];

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Firings previewed live under the expression while it is being typed. */
const PREVIEW_RUNS = 3;

/** One labelled control. The label sits above, quiet, in sentence case. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
            {children}
            {hint ? <p className="text-[11px] leading-snug text-muted-foreground/70">{hint}</p> : null}
        </div>
    );
}

/** A titled group of controls, the way a settings pane stacks them. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <section className="space-y-3">
            {title ? (
                <h3 className="text-[11px] font-semibold text-foreground/70">{title}</h3>
            ) : null}
            {children}
        </section>
    );
}

/** The problems belonging to whatever is selected, shown where they are fixed. */
function Problems({ problems }: { problems: string[] }) {
    if (problems.length === 0) return null;

    return (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.08] px-3 py-2.5 text-[12px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <ul className="space-y-0.5">
                {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
        </div>
    );
}

export function TriggerInspector({
    trigger,
    problems,
    onChange,
}: {
    trigger: PipelineTrigger;
    problems: string[];
    onChange: (trigger: PipelineTrigger) => void;
}) {
    const cron = trigger.kind === 'cron' ? trigger : null;
    const scheduleError = cron ? cronError(cron.expression) : null;

    const zones = useMemo(() => {
        const browser = browserTimeZone();
        return COMMON_TIMEZONES.includes(browser) ? COMMON_TIMEZONES : [browser, ...COMMON_TIMEZONES];
    }, []);

    const upcoming = useMemo(() => (
        cron && !scheduleError ? nextCronRuns(cron.expression, cron.timezone, PREVIEW_RUNS) : []
    ), [cron, scheduleError]);

    return (
        <div className="space-y-6">
            <Group title="Trigger">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1">
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn('h-8 gap-2 rounded-lg text-[12px]', cron && 'bg-card shadow-sm')}
                        onClick={() => onChange({ kind: 'cron', expression: '0 6 * * *', timezone: browserTimeZone() })}
                    >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Schedule
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn('h-8 gap-2 rounded-lg text-[12px]', !cron && 'bg-card shadow-sm')}
                        onClick={() => onChange({ kind: 'manual' })}
                    >
                        <Hand className="h-3.5 w-3.5" />
                        Manual
                    </Button>
                </div>
            </Group>

            {cron ? (
                <>
                    <Group>
                        <Field label="Preset">
                            <Select
                                value={CRON_PRESETS.find((preset) => preset.expression === cron.expression)?.expression ?? 'custom'}
                                onValueChange={(value) => {
                                    if (value !== 'custom') onChange({ ...cron, expression: value });
                                }}
                            >
                                <SelectTrigger aria-label="Schedule preset">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CRON_PRESETS.map((preset) => (
                                        <SelectItem key={preset.expression} value={preset.expression}>
                                            {preset.label}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="custom">Custom…</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label="Expression">
                            <Input
                                className="font-mono"
                                spellCheck={false}
                                placeholder="0 6 * * *"
                                value={cron.expression}
                                aria-label="Cron expression"
                                onChange={(event) => onChange({ ...cron, expression: event.target.value })}
                            />
                            <p className={cn('text-[11px]', scheduleError ? 'text-destructive' : 'text-muted-foreground')}>
                                {scheduleError ?? describeCron(cron.expression)}
                            </p>
                        </Field>

                        <Field label="Time zone" hint="The schedule belongs to the pipeline, not to whoever opens it.">
                            <Select value={cron.timezone} onValueChange={(value) => onChange({ ...cron, timezone: value })}>
                                <SelectTrigger aria-label="Schedule time zone">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {zones.map((zone) => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Field>
                    </Group>

                    {/* The reason the editor computes times at all: an expression
                        is not readable, and three real dates are. */}
                    <Group title="Next firings">
                        {upcoming.length === 0 ? (
                            <p className="text-[11px] text-warning">
                                {scheduleError ? 'Fix the expression to preview it.' : 'Valid, but it never occurs.'}
                            </p>
                        ) : (
                            <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
                                {upcoming.map((date) => (
                                    <div
                                        key={date.toISOString()}
                                        className="flex items-baseline justify-between gap-2 px-3 py-2 text-[11px]"
                                    >
                                        <span className="font-mono text-foreground/90">
                                            {formatInZone(date.getTime(), cron.timezone)}
                                        </span>
                                        <span className="text-muted-foreground/70">{formatUntil(date.getTime())}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Group>
                </>
            ) : (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Nothing starts this pipeline automatically. It runs when someone presses Run now.
                </p>
            )}

            <Problems problems={problems} />
        </div>
    );
}

export function StepInspector({
    step,
    index,
    agents,
    steps,
    problems,
    dangling,
    onChange,
}: {
    step: PipelineStep;
    index: number;
    agents: PipelineAgent[];
    /** The whole pipeline, so an input can name any step that runs earlier. */
    steps: PipelineStep[];
    problems: string[];
    /** Step ids this step references that do not run before it. */
    dangling: string[];
    onChange: (step: PipelineStep) => void;
}) {
    const Icon = STEP_KIND_ICONS[step.kind];

    return (
        <div className="space-y-6">
            <Group>
                <Field label={`Step ${index + 1}`} hint={STEP_KIND_HINTS[step.kind]}>
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-muted-foreground mac-squircle">
                            <Icon className="h-4 w-4" />
                        </span>
                        <Input
                            aria-label="Step name"
                            value={step.name}
                            onChange={(event) => onChange({ ...step, name: event.target.value })}
                        />
                    </div>
                </Field>
            </Group>

            <DataFlow step={step} steps={steps} onChange={onChange} />

            {step.kind === 'branch'
                ? <BranchFields step={step} onChange={onChange} />
                : <ActionFields step={step} agents={agents} onChange={onChange} />}

            {dangling.length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.08] px-3 py-2.5 text-[12px] text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>
                        {dangling.includes('input')
                            ? 'This is the first step, so there is no {{ input }} to read.'
                            : `References a step that does not run before this one: ${dangling.join(', ')}.`}
                    </p>
                </div>
            ) : null}

            <Problems problems={problems} />
        </div>
    );
}

/**
 * What the step reads and what it hands on.
 *
 * The two ends of a step are the part people get wrong — a convert step aimed
 * at the wrong document, a script reading an HTTP status where it wanted a
 * body — and until now the editor said nothing about either. Input is editable
 * where it is a real choice; output is described, and its reference token is
 * offered for pasting into a later step, because typing `{{ steps.st-4f2a.output }}`
 * from memory is not a thing anyone does correctly.
 */
function DataFlow({
    step,
    steps,
    onChange,
}: {
    step: PipelineStep;
    steps: PipelineStep[];
    onChange: (step: PipelineStep) => void;
}) {
    const [copied, setCopied] = useState(false);
    const reference = outputReference(step);

    // Only what runs before this step can be its input; offering a later step
    // would be offering a value that does not exist yet.
    const earlier = useMemo(() => {
        const flat = flattenSteps(steps).map((entry) => entry.step);
        const position = flat.findIndex((entry) => entry.id === step.id);
        return flat.slice(0, position === -1 ? 0 : position).filter((entry) => entry.kind !== 'branch');
    }, [steps, step.id]);

    const takesInput = step.kind === 'convert' || step.kind === 'transform';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(reference);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard access can be refused; the token is selectable anyway.
            setCopied(false);
        }
    };

    return (
        <Group title="Data">
            {takesInput ? (
                <Field label="Input" hint={`Reads ${describeInput(step.input, steps)}.`}>
                    <Select
                        value={step.input.kind === 'previous' ? 'previous' : step.input.step_id}
                        onValueChange={(value) => onChange({
                            ...step,
                            input: value === 'previous' ? { kind: 'previous' } : { kind: 'step', step_id: value },
                        })}
                    >
                        <SelectTrigger aria-label="Input source">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="previous">The previous step</SelectItem>
                            {earlier.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : (
                <Field label="Input">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {step.kind === 'branch'
                            ? 'Tests the step that ran before it.'
                            : 'Written into the fields above with {{ input }}, or a step reference.'}
                    </p>
                </Field>
            )}

            <Field label="Output" hint={describeOutput(step)}>
                <button
                    type="button"
                    onClick={() => void copy()}
                    disabled={step.kind === 'branch'}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-2 text-left transition-colors',
                        'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                        'disabled:pointer-events-none disabled:opacity-50'
                    )}
                    aria-label="Copy this step's output reference"
                >
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                        {reference}
                    </span>
                    {copied
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                        : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
            </Field>
        </Group>
    );
}

/**
 * The condition builder.
 *
 * A list of rules with one combinator, not a single dropdown: the questions
 * pipelines actually ask are compound — the request succeeded *and* the payload
 * is empty, the exit code is non-zero *or* the output mentions a timeout — and
 * a fork that can only test one thing forces those into nested forks.
 *
 * The sentence under the list is the point of the whole panel. A fork taking
 * the wrong path is the most expensive quiet bug a pipeline has, and reading
 * the rules back as one clause is the only cheap defence.
 */
function BranchFields({ step, onChange }: { step: BranchStep; onChange: (step: PipelineStep) => void }) {
    const setRules = (rules: ConditionRule[]) => onChange({ ...step, rules });

    const updateRule = (id: string, next: Partial<ConditionRule>) => {
        setRules(step.rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));
    };

    return (
        <Group title="Conditions">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1">
                {(['all', 'any'] as ConditionMatch[]).map((match) => (
                    <Button
                        key={match}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn('h-8 rounded-lg text-[12px]', step.match === match && 'bg-card shadow-sm')}
                        onClick={() => onChange({ ...step, match })}
                    >
                        {match === 'all' ? 'Match all' : 'Match any'}
                    </Button>
                ))}
            </div>

            {step.rules.length === 0 ? (
                <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-4 text-center text-[11px] text-muted-foreground">
                    No conditions yet. Without one the fork always takes the first path.
                </p>
            ) : null}

            {step.rules.map((rule, index) => (
                <div key={rule.id} className="space-y-2 rounded-xl border border-hairline bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                            {index === 0 ? 'When' : step.match === 'all' ? 'And' : 'Or'}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label={`Remove condition ${index + 1}`}
                            onClick={() => setRules(step.rules.filter((entry) => entry.id !== rule.id))}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <Select
                        value={rule.subject.kind}
                        onValueChange={(value) => {
                            const kind = value as ConditionSubject['kind'];
                            const subject: ConditionSubject = kind === 'field'
                                ? { kind: 'field', path: '' }
                                : { kind };
                            // The operator may not apply to the new subject —
                            // "contains" over an exit code, say — so it falls
                            // back to the first one that does.
                            const allowed = operatorsFor(subject);
                            const operator = allowed.includes(rule.operator) ? rule.operator : allowed[0];
                            updateRule(rule.id, { subject, operator, value: kind === 'status' ? 'failed' : rule.value });
                        }}
                    >
                        <SelectTrigger aria-label={`Condition ${index + 1} subject`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(CONDITION_SUBJECT_LABELS) as ConditionSubject['kind'][]).map((kind) => (
                                <SelectItem key={kind} value={kind}>{CONDITION_SUBJECT_LABELS[kind]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {rule.subject.kind === 'field' ? (
                        <Input
                            className="h-8 font-mono text-xs"
                            spellCheck={false}
                            placeholder="items.0.status"
                            value={rule.subject.path}
                            aria-label={`Condition ${index + 1} field path`}
                            onChange={(event) => updateRule(rule.id, {
                                subject: { kind: 'field', path: event.target.value },
                            })}
                        />
                    ) : null}

                    <div className="flex gap-2">
                        <Select
                            value={rule.operator}
                            onValueChange={(value) => updateRule(rule.id, { operator: value as ConditionOperator })}
                        >
                            <SelectTrigger className="h-8 min-w-0 flex-1" aria-label={`Condition ${index + 1} operator`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {operatorsFor(rule.subject).map((operator) => (
                                    <SelectItem key={operator} value={operator}>
                                        {CONDITION_OPERATOR_LABELS[operator]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {takesValue(rule.operator) ? (
                            rule.subject.kind === 'status' ? (
                                <Select
                                    value={rule.value || 'failed'}
                                    onValueChange={(value) => updateRule(rule.id, { value })}
                                >
                                    <SelectTrigger className="h-8 w-28" aria-label={`Condition ${index + 1} value`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_VALUES.map((status) => (
                                            <SelectItem key={status} value={status}>{status}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    className="h-8 w-28 font-mono text-xs"
                                    spellCheck={false}
                                    placeholder={rule.subject.kind === 'exit_code' ? '0' : 'value'}
                                    value={rule.value}
                                    aria-label={`Condition ${index + 1} value`}
                                    onChange={(event) => updateRule(rule.id, { value: event.target.value })}
                                />
                            )
                        ) : null}
                    </div>
                </div>
            ))}

            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => setRules([...step.rules, blankRule()])}
            >
                <Plus className="h-3 w-3" />
                Add condition
            </Button>

            <p className="flex items-start gap-2 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                    Runs the <span className="text-foreground">top path</span> when{' '}
                    {describeCondition(step)}, and the <span className="text-foreground">bottom path</span>{' '}
                    when it does not.
                </span>
            </p>
        </Group>
    );
}

/** A new rule starts on the test people reach for most: did it fail. */
function blankRule(): ConditionRule {
    return {
        id: `cnd-${Math.random().toString(36).slice(2, 8)}`,
        subject: { kind: 'status' },
        operator: 'is',
        value: 'failed',
    };
}

function ActionFields({
    step,
    agents,
    onChange,
}: {
    step: ActionStep;
    agents: PipelineAgent[];
    onChange: (step: PipelineStep) => void;
}) {
    return (
        <>
            {step.kind === 'command' ? (
                <Group title="Command">
                    <Field label="Shell command">
                        <Textarea
                            className="min-h-28 font-mono text-xs"
                            spellCheck={false}
                            placeholder="pg_dump --format=custom phirepass"
                            value={step.command}
                            aria-label="Command"
                            onChange={(event) => onChange({ ...step, command: event.target.value })}
                        />
                    </Field>
                    <Field label="Working directory">
                        <Input
                            className="font-mono text-xs"
                            placeholder="agent default"
                            value={step.working_dir ?? ''}
                            aria-label="Working directory"
                            onChange={(event) => onChange({
                                ...step,
                                working_dir: event.target.value.trim() === '' ? null : event.target.value,
                            })}
                        />
                    </Field>
                </Group>
            ) : null}

            {step.kind === 'http' ? <HttpFields step={step} onChange={onChange} /> : null}

            {step.kind === 'convert' ? <ConvertFields step={step} onChange={onChange} /> : null}

            {step.kind === 'transform' ? (
                <Group title="Script">
                    <LuaEditor
                        value={step.script}
                        onChange={(script) => onChange({ ...step, script })}
                        label="Lua transform"
                        placeholder="return input"
                    />
                </Group>
            ) : null}

            <Group title="Execution">
                <Field label="Runs on">
                    <TargetSelect
                        target={step.target}
                        agents={agents}
                        onChange={(target) => onChange({ ...step, target })}
                    />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Timeout">
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={1}
                                value={step.timeout_secs}
                                aria-label="Timeout in seconds"
                                onChange={(event) => onChange({
                                    ...step,
                                    timeout_secs: Math.max(1, Math.round(Number(event.target.value) || 1)),
                                })}
                            />
                            <span className="text-[11px] text-muted-foreground">sec</span>
                        </div>
                    </Field>
                    <Field label="On failure">
                        <Select
                            value={step.on_failure}
                            onValueChange={(value) => onChange({ ...step, on_failure: value as StepFailurePolicy })}
                        >
                            <SelectTrigger aria-label="Failure policy">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(FAILURE_POLICY_LABELS) as StepFailurePolicy[]).map((policy) => (
                                    <SelectItem key={policy} value={policy}>{FAILURE_POLICY_LABELS[policy]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
            </Group>
        </>
    );
}

/**
 * The parse step's fields.
 *
 * Two of the three do the real work. `root_path` is what turns a parsed RSS
 * document into the list of items, and `always_array` is the difference between
 * a pipeline that works and one that works except on days the feed has a single
 * entry.
 */
function ConvertFields({ step, onChange }: { step: ConvertStep; onChange: (step: PipelineStep) => void }) {
    // A conversion that changes nothing and narrows nothing is a step that does
    // nothing; said as a hint rather than an error, because it is a state the
    // step passes through while being set up.
    const inert = step.from === step.to && step.root_path.trim() === '';

    return (
        <Group title="Convert">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Field label="From">
                    <Select
                        value={step.from}
                        onValueChange={(value) => onChange({ ...step, from: value as ConvertFormat })}
                    >
                        <SelectTrigger aria-label="Input format">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(CONVERT_FORMAT_LABELS) as ConvertFormat[]).map((format) => (
                                <SelectItem key={format} value={format}>{CONVERT_FORMAT_LABELS[format]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                <ArrowRight aria-hidden className="mb-2.5 h-3.5 w-3.5 text-muted-foreground/60" />

                <Field label="To">
                    <Select
                        value={step.to}
                        onValueChange={(value) => onChange({ ...step, to: value as ConvertFormat })}
                    >
                        <SelectTrigger aria-label="Output format">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(CONVERT_FORMAT_LABELS) as ConvertFormat[]).map((format) => (
                                <SelectItem key={format} value={format}>{CONVERT_FORMAT_LABELS[format]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            {inert ? (
                <p className="text-[11px] leading-snug text-warning">
                    Same format in and out, with no path — this step would hand on what it was given.
                </p>
            ) : null}

            <Field
                label="Path"
                hint="Dotted path into the parsed document. Leave empty to pass the whole thing on."
            >
                <Input
                    className="font-mono text-xs"
                    spellCheck={false}
                    placeholder="rss.channel.item"
                    value={step.root_path}
                    aria-label="Root path"
                    onChange={(event) => onChange({ ...step, root_path: event.target.value })}
                />
            </Field>

            <label className="flex items-start gap-2.5 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
                <Checkbox
                    checked={step.always_array}
                    onCheckedChange={(checked) => onChange({ ...step, always_array: checked === true })}
                    aria-label="Always produce a list"
                    className="mt-0.5"
                />
                <span className="text-[11px] leading-snug text-muted-foreground">
                    <span className="block text-[12px] font-medium text-foreground">Always a list</span>
                    One match still arrives as a list, so a feed with a single entry does not break
                    the step after this one.
                </span>
            </label>
        </Group>
    );
}

function HttpFields({ step, onChange }: { step: HttpStep; onChange: (step: PipelineStep) => void }) {
    const carriesBody = step.method !== 'GET' && step.method !== 'DELETE';

    return (
        <Group title="Request">
            <div className="flex gap-2">
                <Select
                    value={step.method}
                    onValueChange={(value) => {
                        const method = value as HttpMethod;
                        const allowsBody = method !== 'GET' && method !== 'DELETE';
                        onChange({ ...step, method, body: allowsBody ? step.body ?? '' : null });
                    }}
                >
                    <SelectTrigger className="w-24 shrink-0" aria-label="HTTP method">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {HTTP_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Input
                    className="min-w-0 flex-1 font-mono text-xs"
                    spellCheck={false}
                    placeholder="https://news.ycombinator.com/rss"
                    value={step.url}
                    aria-label="Request URL"
                    onChange={(event) => onChange({ ...step, url: event.target.value })}
                />
            </div>

            <Field label="Headers">
                <div className="space-y-2">
                    {step.headers.map((header, position) => (
                        <div key={position} className="flex gap-2">
                            <Input
                                className="h-8 min-w-0 flex-1 font-mono text-xs"
                                placeholder="content-type"
                                value={header.name}
                                aria-label={`Header ${position + 1} name`}
                                onChange={(event) => onChange({
                                    ...step,
                                    headers: step.headers.map((entry, entryIndex) => (
                                        entryIndex === position ? { ...entry, name: event.target.value } : entry
                                    )),
                                })}
                            />
                            <Input
                                className="h-8 min-w-0 flex-1 font-mono text-xs"
                                placeholder="application/json"
                                value={header.value}
                                aria-label={`Header ${position + 1} value`}
                                onChange={(event) => onChange({
                                    ...step,
                                    headers: step.headers.map((entry, entryIndex) => (
                                        entryIndex === position ? { ...entry, value: event.target.value } : entry
                                    )),
                                })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label={`Remove header ${position + 1}`}
                                onClick={() => onChange({
                                    ...step,
                                    headers: step.headers.filter((_, entryIndex) => entryIndex !== position),
                                })}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px]"
                        onClick={() => onChange({ ...step, headers: [...step.headers, { name: '', value: '' }] })}
                    >
                        <Plus className="h-3 w-3" />
                        Add header
                    </Button>
                </div>
            </Field>

            {carriesBody ? (
                <Field
                    label="Body"
                    hint="{{ input }} is the previous step's output; {{ steps.<id>.output }} reaches any earlier one."
                >
                    <Textarea
                        className="min-h-24 font-mono text-xs"
                        spellCheck={false}
                        placeholder={'{ "text": "{{ input }}" }'}
                        value={step.body ?? ''}
                        aria-label="Request body"
                        onChange={(event) => onChange({ ...step, body: event.target.value })}
                    />
                </Field>
            ) : null}
        </Group>
    );
}

/** Agents, then tags, then everything — the order people reach for them in. */
function TargetSelect({
    target,
    agents,
    onChange,
}: {
    target: StepTarget;
    agents: PipelineAgent[];
    onChange: (target: StepTarget) => void;
}) {
    const tags = [...new Set(agents.flatMap((agent) => agent.tags))].sort();

    const value = target.kind === 'node'
        ? `node:${target.node_id}`
        : target.kind === 'tag' ? `tag:${target.tag}` : 'all';

    return (
        <Select
            value={value}
            onValueChange={(next) => {
                if (next === 'all') return onChange({ kind: 'all' });
                const separator = next.indexOf(':');
                const kind = next.slice(0, separator);
                const rest = next.slice(separator + 1);
                onChange(kind === 'node' ? { kind: 'node', node_id: rest } : { kind: 'tag', tag: rest });
            }}
        >
            <SelectTrigger aria-label="Agent this step runs on">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {agents.map((agent) => (
                    <SelectItem key={agent.id} value={`node:${agent.id}`}>
                        {agent.name}{agent.online ? '' : ' (offline)'}
                    </SelectItem>
                ))}
                {tags.map((tag) => <SelectItem key={tag} value={`tag:${tag}`}>tag: {tag}</SelectItem>)}
                <SelectItem value="all">All agents</SelectItem>
            </SelectContent>
        </Select>
    );
}
