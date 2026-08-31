import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CRON_PRESETS, cronError, describeCron, nextCronRun, nextCronRuns, parseCron } from './cron.ts';

/** Fixed instant so every expectation below is a date, not a relative claim. */
const FROM = new Date('2026-03-10T09:17:30Z');

function iso(dates: Date[]): string[] {
    return dates.map((date) => date.toISOString());
}

test('a plain five-field expression parses', () => {
    const result = parseCron('30 4 * * 1');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.schedule.minute.values, [30]);
    assert.deepEqual(result.schedule.hour.values, [4]);
    assert.deepEqual(result.schedule.dayOfWeek.values, [1]);
    assert.equal(result.schedule.dayOfMonth.isAll, true);
});

test('the wrong number of fields is rejected by count', () => {
    assert.match(cronError('0 3 * *') ?? '', /Expected 5 fields/);
    assert.match(cronError('0 3 * * * *') ?? '', /Expected 5 fields/);
});

test('out-of-range values name the field they came from', () => {
    assert.match(cronError('61 * * * *') ?? '', /minute/);
    assert.match(cronError('0 25 * * *') ?? '', /hour/);
    assert.match(cronError('0 0 32 * *') ?? '', /day of month/);
});

test('a backwards range is rejected rather than silently matching nothing', () => {
    assert.match(cronError('0 9-5 * * *') ?? '', /backwards/);
});

test('names are accepted for months and weekdays', () => {
    const result = parseCron('0 0 * jan,jul mon');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.schedule.month.values, [1, 7]);
    assert.deepEqual(result.schedule.dayOfWeek.values, [1]);
});

/** Both spellings of Sunday have to mean the same day. */
test('weekday 7 is Sunday, the same as 0', () => {
    assert.deepEqual(
        iso(nextCronRuns('0 0 * * 7', 'UTC', 2, FROM)),
        iso(nextCronRuns('0 0 * * 0', 'UTC', 2, FROM))
    );
});

test('macros expand to their five-field form', () => {
    assert.deepEqual(iso(nextCronRuns('@daily', 'UTC', 1, FROM)), ['2026-03-11T00:00:00.000Z']);
    assert.deepEqual(iso(nextCronRuns('@hourly', 'UTC', 1, FROM)), ['2026-03-10T10:00:00.000Z']);
});

test('every preset offered by the form parses and fires', () => {
    for (const preset of CRON_PRESETS) {
        assert.equal(cronError(preset.expression), null, preset.expression);
        assert.equal(nextCronRuns(preset.expression, 'UTC', 1, FROM).length, 1, preset.expression);
    }
});

test('a step lists the minutes it lands on, not every minute', () => {
    assert.deepEqual(iso(nextCronRuns('*/15 * * * *', 'UTC', 3, FROM)), [
        '2026-03-10T09:30:00.000Z',
        '2026-03-10T09:45:00.000Z',
        '2026-03-10T10:00:00.000Z',
    ]);
});

test('a daily schedule rolls to tomorrow once today has passed', () => {
    assert.deepEqual(iso(nextCronRuns('0 3 * * *', 'UTC', 2, FROM)), [
        '2026-03-11T03:00:00.000Z',
        '2026-03-12T03:00:00.000Z',
    ]);
});

test('a weekday range skips the weekend', () => {
    // 2026-03-13 is a Friday, so the next weekday run is the following Monday.
    assert.deepEqual(iso(nextCronRuns('0 8 * * 1-5', 'UTC', 6, FROM)), [
        '2026-03-11T08:00:00.000Z',
        '2026-03-12T08:00:00.000Z',
        '2026-03-13T08:00:00.000Z',
        '2026-03-16T08:00:00.000Z',
        '2026-03-17T08:00:00.000Z',
        '2026-03-18T08:00:00.000Z',
    ]);
});

/**
 * The rule that surprises people: with both day fields restricted, cron fires
 * when *either* matches. `0 0 13 * 5` is every Friday and every 13th.
 */
test('day of month and day of week are ORed when both are restricted', () => {
    assert.deepEqual(iso(nextCronRuns('0 0 13 * 5', 'UTC', 3, FROM)), [
        '2026-03-13T00:00:00.000Z',
        '2026-03-20T00:00:00.000Z',
        '2026-03-27T00:00:00.000Z',
    ]);
});

test('a schedule that can never occur returns nothing rather than hanging', () => {
    assert.deepEqual(nextCronRuns('0 0 30 2 *', 'UTC', 1, FROM), []);
});

test('an unparseable schedule yields no runs', () => {
    assert.deepEqual(nextCronRuns('not a schedule', 'UTC', 3, FROM), []);
});

/**
 * The whole reason times are computed in a named zone. 03:00 in Berlin is
 * 02:00Z in winter and 01:00Z in summer, and the pipeline means the former.
 */
test('a daily run is anchored to its zone, not to UTC', () => {
    const berlin = nextCronRuns('0 3 * * *', 'Europe/Berlin', 1, new Date('2026-01-15T12:00:00Z'));
    assert.deepEqual(iso(berlin), ['2026-01-16T02:00:00.000Z']);

    const summer = nextCronRuns('0 3 * * *', 'Europe/Berlin', 1, new Date('2026-07-15T12:00:00Z'));
    assert.deepEqual(iso(summer), ['2026-07-16T01:00:00.000Z']);
});

/**
 * Europe/Berlin jumps 02:00 -> 03:00 on 2026-03-29, so a 02:30 job has no
 * instant to run at that morning and must simply not fire, exactly as cron
 * behaves — not fire twice, and not silently slide to 03:30.
 */
test('a wall time that DST skips is skipped, not shifted', () => {
    const runs = nextCronRuns('30 2 * * *', 'Europe/Berlin', 3, new Date('2026-03-27T12:00:00Z'));
    assert.deepEqual(iso(runs), [
        '2026-03-28T01:30:00.000Z',
        '2026-03-30T00:30:00.000Z',
        '2026-03-31T00:30:00.000Z',
    ]);
});

/** The repeated hour must not produce a stalled or backwards iteration. */
test('the hour a zone repeats still advances', () => {
    const runs = nextCronRuns('30 2 * * *', 'Europe/Berlin', 2, new Date('2026-10-24T12:00:00Z'));
    assert.equal(runs.length, 2);
    assert.ok(runs[1].getTime() > runs[0].getTime());
});

test('nextCronRun is the first of nextCronRuns', () => {
    assert.deepEqual(
        nextCronRun('0 3 * * *', 'UTC', FROM)?.toISOString(),
        '2026-03-11T03:00:00.000Z'
    );
    assert.equal(nextCronRun('0 0 30 2 *', 'UTC', FROM), null);
});

test('descriptions read as schedules', () => {
    assert.equal(describeCron('*/15 * * * *'), 'Every 15 minutes');
    assert.equal(describeCron('0 * * * *'), 'Every hour at :00');
    assert.equal(describeCron('0 3 * * *'), 'Every day at 03:00');
    assert.equal(describeCron('30 4 * * 1'), 'At 04:30, on Monday');
    assert.equal(describeCron('0 8 * * 1-5'), 'At 08:00, on weekdays');
    assert.equal(describeCron('0 5 1 * *'), 'At 05:00, on day 1 of the month');
    assert.equal(describeCron('nonsense'), 'Invalid schedule');
});

/** The OR rule has to survive into the label, or the label misleads. */
test('a description spells out the OR between the two day fields', () => {
    assert.match(describeCron('0 0 13 * 5'), /or on day 13 of the month/);
});
