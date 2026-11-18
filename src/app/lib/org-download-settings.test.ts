import assert from 'node:assert/strict';
import test from 'node:test';

import { ORG_DOWNLOAD_DEFAULTS, parseOrgSettings, readOrgSettings } from './org-download-settings.ts';

test('a missing or bad stored key reads as its default', () => {
    assert.deepEqual(readOrgSettings(null), ORG_DOWNLOAD_DEFAULTS);
    assert.deepEqual(readOrgSettings({}), { keep_days: 30, stream_link_hours: 6 });
    assert.deepEqual(readOrgSettings({ keep_days: 7, stream_link_hours: 'x' }), { keep_days: 7, stream_link_hours: 6 });
    assert.deepEqual(readOrgSettings({ keep_days: 0 }), ORG_DOWNLOAD_DEFAULTS);
});

test('a save must carry every field in range', () => {
    assert.deepEqual(parseOrgSettings({ keep_days: 90, stream_link_hours: 24 }), {
        ok: { keep_days: 90, stream_link_hours: 24 },
    });
    assert.deepEqual(parseOrgSettings({ keep_days: 0, stream_link_hours: 6 }), {
        field: 'keep_days',
        error: 'Keep finished downloads for 1 to 3650 days.',
    });
    assert.equal('field' in parseOrgSettings({ keep_days: 30, stream_link_hours: 1.5 }), true);
    assert.equal('field' in parseOrgSettings({ keep_days: 30 }), true);
});
