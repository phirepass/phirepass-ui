/**
 * Five-field cron: parsing, a readable summary, and the next times it fires.
 *
 * A pipeline's schedule is the part a user gets wrong, and gets wrong silently —
 * `0 3 * * 7` and `0 3 * * 0` look equally plausible and one of them is Sunday.
 * So the form does not just validate the expression, it shows the next few
 * firings computed from it; that preview is the whole reason this module
 * computes times rather than only checking syntax.
 *
 * Deliberately dependency-free and free of path aliases: it is pure enough to
 * be exercised by `node --test`, which resolves neither.
 *
 * Times are computed in a named IANA zone rather than the browser's, because
 * the schedule belongs to the pipeline, not to whoever is looking at it. The
 * zone conversion goes through `Intl`, so DST is whatever the platform's tz
 * database says — a daily 02:30 job simply does not fire on the morning that
 * has no 02:30, which is the same thing Vixie cron does.
 */

/** One parsed field, keeping enough of its source to describe it later. */
interface CronField {
    /** Matching values, ascending. */
    values: number[];
    set: Set<number>;
    /** True when the field was `*` — "unrestricted", which day matching needs. */
    isAll: boolean;
    /** Set when the field was written as a bare step, so "every 15 minutes" can be said. */
    step: number | null;
}

export interface CronSchedule {
    minute: CronField;
    hour: CronField;
    dayOfMonth: CronField;
    month: CronField;
    dayOfWeek: CronField;
}

export type CronParseResult =
    | { ok: true; schedule: CronSchedule }
    | { ok: false; error: string };

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH_ALIASES: Record<string, number> = Object.fromEntries(
    MONTH_NAMES.map((name, index) => [name.toLowerCase(), index + 1])
);

const DAY_ALIASES: Record<string, number> = Object.fromEntries(
    DAY_NAMES.map((name, index) => [name.slice(0, 3).toLowerCase(), index])
);

/** `@daily` and friends, expanded before anything else looks at the string. */
const MACROS: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
};

interface FieldSpec {
    label: string;
    min: number;
    max: number;
    aliases?: Record<string, number>;
}

const FIELD_SPECS: FieldSpec[] = [
    { label: 'minute', min: 0, max: 59 },
    { label: 'hour', min: 0, max: 23 },
    { label: 'day of month', min: 1, max: 31 },
    { label: 'month', min: 1, max: 12, aliases: MONTH_ALIASES },
    { label: 'day of week', min: 0, max: 6, aliases: DAY_ALIASES },
];

function parseValue(token: string, spec: FieldSpec): number | null {
    const alias = spec.aliases?.[token.toLowerCase()];
    if (alias !== undefined) return alias;

    if (!/^\d+$/.test(token)) return null;
    const value = Number(token);

    // 7 is Sunday as well as 0, which is the one aliasing every cron accepts and
    // the single most common way to write "weekly on Sunday".
    if (spec.label === 'day of week' && value === 7) return 0;

    if (value < spec.min || value > spec.max) return null;
    return value;
}

function parseField(raw: string, spec: FieldSpec): CronField | string {
    const values = new Set<number>();
    let step: number | null = null;

    for (const part of raw.split(',')) {
        if (part === '') return `${spec.label}: empty entry in "${raw}"`;

        const [rangePart, stepPart, ...rest] = part.split('/');
        if (rest.length > 0) return `${spec.label}: "${part}" has more than one step`;

        let stepSize = 1;
        if (stepPart !== undefined) {
            if (!/^\d+$/.test(stepPart) || Number(stepPart) === 0) {
                return `${spec.label}: "${stepPart}" is not a step`;
            }
            stepSize = Number(stepPart);
        }

        let start: number;
        let end: number;

        if (rangePart === '*') {
            start = spec.min;
            end = spec.max;
            if (stepPart !== undefined && raw === part) step = stepSize;
        } else if (rangePart.includes('-')) {
            const [fromToken, toToken, ...extra] = rangePart.split('-');
            if (extra.length > 0) return `${spec.label}: "${rangePart}" is not a range`;
            const from = parseValue(fromToken, spec);
            const to = parseValue(toToken, spec);
            if (from === null) return `${spec.label}: "${fromToken}" is out of ${spec.min}-${spec.max}`;
            if (to === null) return `${spec.label}: "${toToken}" is out of ${spec.min}-${spec.max}`;
            if (from > to) return `${spec.label}: range "${rangePart}" runs backwards`;
            start = from;
            end = to;
        } else {
            const value = parseValue(rangePart, spec);
            if (value === null) return `${spec.label}: "${rangePart}" is out of ${spec.min}-${spec.max}`;
            start = value;
            // A bare value with a step means "from here to the end of the field",
            // so `5/10` in minutes is 5, 15, 25...
            end = stepPart === undefined ? value : spec.max;
        }

        for (let value = start; value <= end; value += stepSize) {
            values.add(value);
        }
    }

    if (values.size === 0) return `${spec.label}: matches nothing`;

    const ascending = [...values].sort((a, b) => a - b);

    return {
        values: ascending,
        set: values,
        isAll: raw === '*' || ascending.length === spec.max - spec.min + 1,
        step,
    };
}

/** Expands a macro, collapses whitespace; the form accepts either form. */
function normalize(expression: string): string {
    const trimmed = expression.trim().toLowerCase();
    return MACROS[trimmed] ?? expression.trim().replace(/\s+/g, ' ');
}

export function parseCron(expression: string): CronParseResult {
    const normalized = normalize(expression);

    if (normalized === '') {
        return { ok: false, error: 'Enter a schedule, for example 0 3 * * *' };
    }

    const fields = normalized.split(' ');
    if (fields.length !== 5) {
        return {
            ok: false,
            error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}`,
        };
    }

    const parsed: CronField[] = [];
    for (let index = 0; index < 5; index += 1) {
        const field = parseField(fields[index], FIELD_SPECS[index]);
        if (typeof field === 'string') return { ok: false, error: field };
        parsed.push(field);
    }

    return {
        ok: true,
        schedule: {
            minute: parsed[0],
            hour: parsed[1],
            dayOfMonth: parsed[2],
            month: parsed[3],
            dayOfWeek: parsed[4],
        },
    };
}

/** The parse error, or `null` when the expression is good. */
export function cronError(expression: string): string | null {
    const result = parseCron(expression);
    return result.ok ? null : result.error;
}

// ---------------------------------------------------------------------------
// Zone handling
// ---------------------------------------------------------------------------

interface WallClock {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    const cached = FORMATTERS.get(timeZone);
    if (cached) return cached;

    let formatter: Intl.DateTimeFormat;
    try {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
    } catch {
        // An unknown zone is a data problem, not a reason to render nothing: a
        // schedule shown in UTC is wrong by an offset, a schedule shown as a
        // crash is wrong entirely.
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
    }

    FORMATTERS.set(timeZone, formatter);
    return formatter;
}

/** Whether the platform recognises the zone, for validating a picker value. */
export function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    } catch {
        return false;
    }
}

/** The wall clock shown in `timeZone` at instant `ts`. */
function wallClockAt(ts: number, timeZone: string): WallClock & { second: number } {
    const parts = formatterFor(timeZone).formatToParts(new Date(ts));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');

    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour'),
        minute: read('minute'),
        second: read('second'),
    };
}

/** Zone offset in ms at `ts`, derived from what the zone's clock reads. */
function offsetAt(ts: number, timeZone: string): number {
    const wall = wallClockAt(ts, timeZone);
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    return asUtc - ts;
}

/**
 * The instant at which the zone's clock reads the given wall time.
 *
 * Two passes: the first offset is looked up at the wrong instant (we do not yet
 * know the answer), the second at one that is at most an offset away — enough
 * to land correctly on every transition except a wall time that does not exist,
 * where it returns a nearby instant and the caller's re-check discards it.
 */
function instantOf(wall: WallClock, timeZone: string): number {
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const firstPass = asUtc - offsetAt(asUtc, timeZone);
    return asUtc - offsetAt(firstPass, timeZone);
}

/** Wall time shifted by whole days/hours, normalised through UTC arithmetic. */
function shiftWall(wall: WallClock, days: number, hours: number): WallClock {
    const shifted = new Date(
        Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
        + days * 86_400_000
        + hours * 3_600_000
    );

    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
    };
}

/**
 * Vixie cron's day rule: when *both* day-of-month and day-of-week are
 * restricted the run happens if **either** matches, not both. `0 0 13 * 5` is
 * every Friday plus every 13th, which is the behaviour people write it for.
 */
function dayMatches(schedule: CronSchedule, wall: WallClock): boolean {
    const dow = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
    const domRestricted = !schedule.dayOfMonth.isAll;
    const dowRestricted = !schedule.dayOfWeek.isAll;

    const domHit = schedule.dayOfMonth.set.has(wall.day);
    const dowHit = schedule.dayOfWeek.set.has(dow);

    if (domRestricted && dowRestricted) return domHit || dowHit;
    if (domRestricted) return domHit;
    if (dowRestricted) return dowHit;
    return true;
}

/**
 * The next `count` firings strictly after `from`, in the given zone.
 *
 * Empty for an expression that does not parse, and for one that parses but
 * cannot occur (`0 0 30 2 *` — the 30th of February). Callers render an empty
 * preview rather than a wrong one.
 */
export function nextCronRuns(
    expression: string,
    timeZone: string,
    count: number,
    from: Date = new Date()
): Date[] {
    const parsed = parseCron(expression);
    if (!parsed.ok || count <= 0) return [];

    const schedule = parsed.schedule;
    const runs: Date[] = [];

    // Start on the next whole minute: cron has minute resolution, and a run
    // during the current minute has already been missed.
    let ts = Math.floor(from.getTime() / 60_000) * 60_000 + 60_000;

    // Bounded by days skipped, not minutes scanned — the loop jumps a whole day
    // whenever the date does not match, so this covers decades of "the 29th of
    // February, on a Monday" before it gives up.
    for (let guard = 0; guard < 20_000 && runs.length < count; guard += 1) {
        const wall = wallClockAt(ts, timeZone);

        if (!schedule.month.set.has(wall.month) || !dayMatches(schedule, wall)) {
            ts = advance(instantOf(shiftWall({ ...wall, hour: 0, minute: 0 }, 1, 0), timeZone), ts);
            continue;
        }

        if (!schedule.hour.set.has(wall.hour)) {
            const nextHour = schedule.hour.values.find((hour) => hour > wall.hour);
            const target = nextHour === undefined
                ? shiftWall({ ...wall, hour: 0, minute: 0 }, 1, 0)
                : { ...wall, hour: nextHour, minute: schedule.minute.values[0] };
            ts = advance(instantOf(target, timeZone), ts);
            continue;
        }

        if (!schedule.minute.set.has(wall.minute)) {
            const nextMinute = schedule.minute.values.find((minute) => minute > wall.minute);
            const target = nextMinute === undefined
                ? shiftWall({ ...wall, minute: 0 }, 0, 1)
                : { ...wall, minute: nextMinute };
            ts = advance(instantOf(target, timeZone), ts);
            continue;
        }

        runs.push(new Date(ts));
        ts += 60_000;
    }

    return runs;
}

/**
 * Never let a jump stand still or go backwards. Both happen on the hour a zone
 * repeats: the wall clock we aimed at has already passed, and stepping a minute
 * at a time walks out of it.
 */
function advance(candidate: number, current: number): number {
    return candidate > current ? candidate : current + 60_000;
}

/** The single next firing, or `null`. */
export function nextCronRun(expression: string, timeZone: string, from: Date = new Date()): Date | null {
    return nextCronRuns(expression, timeZone, 1, from)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

function joinList(items: string[]): string {
    if (items.length <= 1) return items[0] ?? '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describeTime(schedule: CronSchedule): string {
    const { minute, hour } = schedule;

    if (minute.isAll && hour.isAll) return 'Every minute';
    if (minute.step && hour.isAll) return `Every ${minute.step} minutes`;
    if (minute.isAll) return `Every minute of ${joinList(hour.values.map((h) => `${pad(h)}:00`))}`;
    if (hour.isAll) return `Every hour at ${joinList(minute.values.map((m) => `:${pad(m)}`))}`;
    if (hour.step && minute.values.length === 1) {
        return `Every ${hour.step} hours at :${pad(minute.values[0])}`;
    }

    // The cartesian product is the honest reading of the two fields, but it is
    // only worth spelling out while it stays short.
    const times: string[] = [];
    for (const h of hour.values) {
        for (const m of minute.values) {
            times.push(`${pad(h)}:${pad(m)}`);
            if (times.length > 4) break;
        }
        if (times.length > 4) break;
    }

    if (times.length > 4) {
        return `At ${times.slice(0, 4).join(', ')} and other times`;
    }

    return `At ${joinList(times)}`;
}

function describeDays(schedule: CronSchedule): string {
    const { dayOfMonth, dayOfWeek, month } = schedule;
    const parts: string[] = [];

    const domRestricted = !dayOfMonth.isAll;
    const dowRestricted = !dayOfWeek.isAll;

    if (dowRestricted && dayOfWeek.values.length === 5
        && dayOfWeek.values.join() === '1,2,3,4,5') {
        parts.push('on weekdays');
    } else if (dowRestricted) {
        parts.push(`on ${joinList(dayOfWeek.values.map((day) => DAY_NAMES[day]))}`);
    }

    if (domRestricted) {
        const days = joinList(dayOfMonth.values.map((day) => day.toString()));
        // Both fields restricted is an OR, not an AND — say so, because reading
        // it as "the 1st, if it is a Monday" is the natural wrong guess.
        parts.push(parts.length > 0 ? `or on day ${days} of the month` : `on day ${days} of the month`);
    }

    if (!month.isAll) {
        parts.push(`in ${joinList(month.values.map((value) => MONTH_NAMES[value - 1]))}`);
    }

    if (parts.length === 0) return 'every day';

    return parts.join(' ');
}

/**
 * A one-line reading of the expression, for the card and the form preview.
 *
 * Best effort by design: it names the shapes people actually write and falls
 * back to spelling out the fields rather than refusing. The preview of real
 * firing times is what makes an unusual expression legible — this is the label.
 */
export function describeCron(expression: string): string {
    const parsed = parseCron(expression);
    if (!parsed.ok) return 'Invalid schedule';

    const schedule = parsed.schedule;
    const time = describeTime(schedule);
    const days = describeDays(schedule);

    // "At 03:00" reads as a one-off; "Every day at 03:00" reads as a schedule.
    if (days === 'every day') {
        return time.startsWith('At ') ? `Every day at ${time.slice(3)}` : time;
    }

    return `${time}, ${days}`;
}

/** Ready-made schedules for the form's picker, in the order they are offered. */
export const CRON_PRESETS: { label: string; expression: string }[] = [
    { label: 'Every 15 minutes', expression: '*/15 * * * *' },
    { label: 'Hourly, on the hour', expression: '0 * * * *' },
    { label: 'Every 6 hours', expression: '0 */6 * * *' },
    { label: 'Daily at 03:00', expression: '0 3 * * *' },
    { label: 'Weekdays at 08:00', expression: '0 8 * * 1-5' },
    { label: 'Weekly, Monday 04:30', expression: '30 4 * * 1' },
    { label: 'Monthly, 1st at 05:00', expression: '0 5 1 * *' },
];
