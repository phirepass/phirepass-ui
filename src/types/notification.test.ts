import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    EVENT_SEVERITY,
    NOTIFICATION_CATEGORY_ORDER,
    NOTIFICATION_EVENTS,
    SEVERITY_ICONS,
    type NotificationCategory,
} from './notification.ts';

/**
 * The catalogue's invariants, which are the ones TypeScript cannot check.
 *
 * Every `Record<NotificationEventId, …>` and `Record<NotificationCategory, …>`
 * in this feature is exhaustive by construction, so the compiler already catches
 * an event added without a tint or a category added without a label. What it
 * cannot see is an array that is *meant* to list every category, or a default
 * that is merely a boolean like any other.
 */

test('every category holding events is listed in the reading order', () => {
    const rendered = new Set<NotificationCategory>(NOTIFICATION_CATEGORY_ORDER);

    for (const event of NOTIFICATION_EVENTS) {
        assert.ok(
            rendered.has(event.category),
            `"${event.category}" holds events but is missing from NOTIFICATION_CATEGORY_ORDER, `
                + 'so its whole group renders nowhere on the settings page',
        );
    }
});

test('the reading order lists no category twice', () => {
    assert.equal(
        new Set(NOTIFICATION_CATEGORY_ORDER).size,
        NOTIFICATION_CATEGORY_ORDER.length,
        'a repeated category renders its group twice, with two sets of switches for the same events',
    );
});

test('event ids are unique', () => {
    const ids = NOTIFICATION_EVENTS.map((event) => event.id);
    assert.equal(new Set(ids).size, ids.length);
});

/**
 * The one that would be expensive to discover in production.
 *
 * A `noisy` event fires on every occurrence rather than on a change, so its
 * volume is one notification per subject per interval with no ceiling. Shipping
 * one enabled would deliver that to every account that has never opened this
 * page — including every account created before the event existed, since a
 * missing key resolves to the default rather than to `false`.
 */
test('an event that fires on every occurrence never ships enabled', () => {
    for (const event of NOTIFICATION_EVENTS) {
        if (!event.noisy) continue;

        assert.equal(
            event.defaultEnabled,
            false,
            `"${event.id}" fires on every occurrence and must not be on by default`,
        );
    }
});

/**
 * Pins the decision rather than the mechanism: monitor alerts are per-monitor
 * and per-threshold, and a first wave of unasked-for ones is how the whole
 * feature gets switched off at the channel — taking the node events with it.
 *
 * These defaults have a second copy in `phirepass-rs`
 * (`common/src/notifications.rs`), which is what the courier actually reads.
 * Nothing fails to compile if the two disagree, so a change here is a change
 * there — this test pins one side, not the agreement.
 */
test('monitor events ship off and node events ship on', () => {
    for (const event of NOTIFICATION_EVENTS) {
        const expected = !event.id.startsWith('monitor.');

        assert.equal(
            event.defaultEnabled,
            expected,
            `"${event.id}" should default ${expected ? 'on' : 'off'}`,
        );
    }
});

/**
 * `createDefaultPreferences` maps straight over this, and the page's initial
 * state and every demo account are built from it — an event with no default
 * renders an uncontrolled switch that silently forgets what it was set to.
 *
 * Asserted on the catalogue rather than through that helper because it reaches
 * this module by the `@/` alias, which the test runner does not resolve.
 */
test('every event states a default', () => {
    for (const event of NOTIFICATION_EVENTS) {
        assert.equal(
            typeof event.defaultEnabled,
            'boolean',
            `"${event.id}" has no default, so its switch would render uncontrolled`,
        );
    }
});

/**
 * The severity map and the icon assets are two hand-kept copies — one of the
 * courier's `icon_for`, one of `NOTIFICATION_ICONS` in `public/sw.js` — so the
 * one thing worth pinning here is that neither has a hole. A missing entry is
 * `undefined`, which indexes the asset map to `undefined`, which renders a
 * broken image in the preview banner.
 */
test('every event has a severity, and every severity has an asset', () => {
    for (const event of NOTIFICATION_EVENTS) {
        const severity = EVENT_SEVERITY[event.id];

        assert.ok(
            ['alert', 'warn', 'default'].includes(severity),
            `"${event.id}" has no severity`,
        );
        assert.ok(SEVERITY_ICONS[severity], `"${severity}" resolves to no asset`);
    }
});

/**
 * The point of a red mark at all: an outage has to be distinguishable from a
 * recovery before a word is read. If these ever collapse to one value the icons
 * are decoration.
 */
test('failures and recoveries do not share a mark', () => {
    assert.equal(EVENT_SEVERITY['monitor.down'], 'alert');
    assert.equal(EVENT_SEVERITY['node.offline'], 'alert');
    assert.equal(EVENT_SEVERITY['monitor.degraded'], 'warn');

    assert.notEqual(EVENT_SEVERITY['monitor.up'], EVENT_SEVERITY['monitor.down']);
    assert.notEqual(EVENT_SEVERITY['node.online'], EVENT_SEVERITY['node.offline']);
});

/**
 * `monitor.degraded` covers three different findings — a slow HTTP response, a
 * certificate inside its expiry window, a registration inside its — and was
 * originally described as slowness alone, which made it read as false for two of
 * the three. The description is what somebody reads before deciding to turn it
 * on, so it has to cover what it will actually tell them about.
 */
test('the degraded event is not described as slowness alone', () => {
    const degraded = NOTIFICATION_EVENTS.find((event) => event.id === 'monitor.degraded');
    assert.ok(degraded, 'monitor.degraded must exist');

    const description = degraded.description.toLowerCase();
    assert.ok(
        description.includes('expiry') || description.includes('expire'),
        `"${degraded.description}" describes only the latency case`,
    );
});
