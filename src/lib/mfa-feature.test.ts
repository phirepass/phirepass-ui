import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mfaEnabledFor } from './mfa-feature.ts';

test('with no flag, the deployment decides', () => {
    assert.equal(mfaEnabledFor(undefined, true), true);
    assert.equal(mfaEnabledFor(undefined, false), false);
    assert.equal(mfaEnabledFor('', true), true);
    assert.equal(mfaEnabledFor('   ', false), false);
});

test('an explicit flag wins in both directions', () => {
    assert.equal(mfaEnabledFor('true', false), true);
    assert.equal(mfaEnabledFor('false', true), false);
});

test('the spellings a compose file actually contains are all understood', () => {
    for (const on of ['true', 'TRUE', ' True ', '1', 'on', 'yes']) {
        assert.equal(mfaEnabledFor(on, false), true, `on: ${on}`);
    }

    for (const off of ['false', 'FALSE', ' off ', '0', 'no']) {
        assert.equal(mfaEnabledFor(off, true), false, `off: ${off}`);
    }
});

test('a value that means nothing falls back to the deployment rather than off', () => {
    // A typo'd flag in production must not quietly disable the second factor.
    assert.equal(mfaEnabledFor('ture', true), true);
    assert.equal(mfaEnabledFor('maybe', false), false);
});
