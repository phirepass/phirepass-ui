import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CLEAR_SQL, GET_SQL, SAVE_SQL, isFileKey, judge } from './playback.ts';

const ID = '0b6d6a5e-3c1f-4a52-9d8e-2b7f1c9a4e10';

describe('playback rules', () => {
    test('keys name a download file or a listing path, nothing else', () => {
        assert.ok(isFileKey(`dl:${ID}:0`));
        assert.ok(isFileKey(`node:${ID}:/home/a/Film one.mkv`));
        assert.ok(!isFileKey(`node:${ID}:relative/path`));
        assert.ok(!isFileKey(`dl:not-a-uuid:0`));
        assert.ok(!isFileKey(`user:${ID}`));
        assert.ok(!isFileKey(`node:${ID}:/` + 'x'.repeat(5000)));
        assert.ok(!isFileKey(42));
    });

    test('nothing is saved before 30 s; past 95% or the last 2 minutes clears', () => {
        assert.deepEqual(judge(29.9, 3600), { kind: 'ignore' });
        assert.deepEqual(judge(760, 3600), { kind: 'save', secs: 760, duration: 3600 });
        assert.deepEqual(judge(3421, 3600), { kind: 'clear' });
        assert.deepEqual(judge(3000, 3100), { kind: 'clear' });
        assert.deepEqual(judge(600, 0), { kind: 'save', secs: 600, duration: 0 }, 'unknown length is never watched');
        assert.equal(judge(-1, 10), null);
        assert.equal(judge('5', 10), null);
        assert.equal(judge(Number.NaN, 10), null);
    });

    test("every statement is keyed on the caller's user id", () => {
        for (const sql of [GET_SQL, SAVE_SQL, CLEAR_SQL]) {
            assert.match(sql, /user_id = \$1|VALUES \(\$1,/);
        }
    });
});
