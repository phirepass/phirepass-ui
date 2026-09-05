import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    STEP_SECONDS,
    base32Decode,
    base32Encode,
    codeForStep,
    formatSecretForDisplay,
    generateSecret,
    isWellFormedCode,
    otpauthUri,
    stepFor,
    verifyCode,
} from './totp.ts';

/**
 * RFC 4648 §10's base32 vectors, unpadded — the encoder emits no `=`, so the
 * expectations are the published strings with the padding cut off.
 */
const BASE32_VECTORS: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
];

test('base32 matches the RFC 4648 vectors in both directions', () => {
    for (const [plain, encoded] of BASE32_VECTORS) {
        assert.equal(base32Encode(Buffer.from(plain)), encoded, `encode ${plain}`);
        assert.equal(base32Decode(encoded).toString(), plain, `decode ${encoded}`);
    }
});

test('base32 decoding forgives padding, spacing and case', () => {
    assert.equal(base32Decode('mzxw6ytb').toString(), 'fooba');
    assert.equal(base32Decode('MZXW 6YTB').toString(), 'fooba');
    assert.equal(base32Decode('MZXW6YQ=').toString(), 'foob');
    assert.throws(() => base32Decode('MZXW6YT1'), /Invalid base32/);
});

/**
 * RFC 6238 Appendix B, SHA1 rows. The published codes are 8 digits and this
 * implementation emits 6, which is the same truncation one modulo further —
 * hence the last six of each.
 */
const RFC6238_SECRET = base32Encode(Buffer.from('12345678901234567890'));

const RFC6238_VECTORS: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
];

test('codeForStep matches the RFC 6238 test vectors', () => {
    for (const [unixSeconds, expected] of RFC6238_VECTORS) {
        const step = Math.floor(unixSeconds / STEP_SECONDS);
        assert.equal(codeForStep(RFC6238_SECRET, step), expected, `t=${unixSeconds}`);
    }
});

test('verifyCode returns the step it matched, not just true', () => {
    const atMs = 1111111109 * 1000;
    const step = stepFor(atMs);

    assert.equal(verifyCode(RFC6238_SECRET, '081804', { atMs }), step);
});

test('verifyCode accepts one step either side and nothing further', () => {
    const atMs = 1111111109 * 1000;
    const step = stepFor(atMs);

    const previous = codeForStep(RFC6238_SECRET, step - 1);
    const next = codeForStep(RFC6238_SECRET, step + 1);
    const distant = codeForStep(RFC6238_SECRET, step + 2);

    assert.equal(verifyCode(RFC6238_SECRET, previous, { atMs }), step - 1);
    assert.equal(verifyCode(RFC6238_SECRET, next, { atMs }), step + 1);
    assert.equal(verifyCode(RFC6238_SECRET, distant, { atMs }), null);
});

test('verifyCode rejects anything that is not six digits', () => {
    const atMs = 1111111109 * 1000;

    assert.equal(verifyCode(RFC6238_SECRET, '', { atMs }), null);
    assert.equal(verifyCode(RFC6238_SECRET, '81804', { atMs }), null);
    assert.equal(verifyCode(RFC6238_SECRET, '0818040', { atMs }), null);
    assert.equal(verifyCode(RFC6238_SECRET, 'abc123', { atMs }), null);
});

test('verifyCode tolerates the spaces a password manager pastes in', () => {
    const atMs = 1111111109 * 1000;

    assert.equal(verifyCode(RFC6238_SECRET, '081 804', { atMs }), stepFor(atMs));
});

test('a code from one secret does not verify against another', () => {
    const atMs = 1111111109 * 1000;
    const other = generateSecret();

    assert.equal(verifyCode(other, '081804', { atMs }), null);
});

test('generated secrets are 32 base32 characters of 20 random bytes', () => {
    const secret = generateSecret();

    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(base32Decode(secret).length, 20);
    assert.notEqual(secret, generateSecret());
});

test('the otpauth URI carries the issuer in both the label and the parameters', () => {
    const uri = otpauthUri({ secret: RFC6238_SECRET, account: 'ada@example.com', issuer: 'PhirePass' });
    const parsed = new URL(uri);

    assert.equal(parsed.protocol, 'otpauth:');
    assert.equal(parsed.host, 'totp');
    assert.equal(decodeURIComponent(parsed.pathname), '/PhirePass:ada@example.com');
    assert.equal(parsed.searchParams.get('secret'), RFC6238_SECRET);
    assert.equal(parsed.searchParams.get('issuer'), 'PhirePass');
    assert.equal(parsed.searchParams.get('algorithm'), 'SHA1');
    assert.equal(parsed.searchParams.get('digits'), '6');
    assert.equal(parsed.searchParams.get('period'), '30');
});

test('the displayed secret is regrouped but still decodes', () => {
    const secret = generateSecret();
    const shown = formatSecretForDisplay(secret);

    assert.match(shown, /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    assert.deepEqual(base32Decode(shown), base32Decode(secret));
});

test('isWellFormedCode gates on shape alone', () => {
    assert.equal(isWellFormedCode('000000'), true);
    assert.equal(isWellFormedCode('12 34 56'), true);
    assert.equal(isWellFormedCode('12345'), false);
    assert.equal(isWellFormedCode(123456), false);
    assert.equal(isWellFormedCode(null), false);
});
