import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'test-secret-for-mfa-derivation';

import {
    decryptSecret,
    encryptSecret,
    generateRecoveryCodes,
    hashRecoveryCode,
    isWellFormedRecoveryCode,
    normalizeRecoveryCode,
} from './mfa.ts';

test('an encrypted secret comes back unchanged', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const stored = encryptSecret(secret);

    assert.notEqual(stored, secret);
    assert.match(stored, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(decryptSecret(stored), secret);
});

test('the same secret encrypts differently every time', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    // A fresh IV per row, so two accounts with the same secret — or one account
    // re-enrolling — do not produce matching ciphertext.
    assert.notEqual(encryptSecret(secret), encryptSecret(secret));
});

test('a tampered row fails to decrypt rather than yielding a wrong secret', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    const [version, iv, tag, ciphertext] = stored.split('.');

    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] ^= 0x01;

    assert.throws(() => decryptSecret([version, iv, tag, flipped.toString('base64url')].join('.')));
    assert.throws(() => decryptSecret('v2.a.b.c'), /Unrecognised/);
    assert.throws(() => decryptSecret('nonsense'), /Unrecognised/);
});

test('a secret encrypted under one JWT_SECRET does not decrypt under another', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    const original = process.env.JWT_SECRET;

    process.env.JWT_SECRET = 'a-different-secret';
    try {
        assert.throws(() => decryptSecret(stored));
    } finally {
        process.env.JWT_SECRET = original;
    }
});

test('a recovery batch is ten distinct hyphenated codes', () => {
    const codes = generateRecoveryCodes();

    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) {
        assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
});

test('recovery codes carry none of the characters that get misread', () => {
    const codes = generateRecoveryCodes(200).join('');

    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
        assert.equal(codes.includes(ambiguous), false, `contains ${ambiguous}`);
    }
});

test('a code hashes the same however it was typed back', () => {
    const [code] = generateRecoveryCodes(1);
    const expected = hashRecoveryCode(code);

    assert.equal(hashRecoveryCode(code.toLowerCase()), expected);
    assert.equal(hashRecoveryCode(code.replace('-', '')), expected);
    assert.equal(hashRecoveryCode(` ${code.replace('-', ' ')} `), expected);
});

test('hashes are hex sha256, and differ between codes', () => {
    const [first, second] = generateRecoveryCodes(2);

    assert.match(hashRecoveryCode(first), /^[0-9a-f]{64}$/);
    assert.notEqual(hashRecoveryCode(first), hashRecoveryCode(second));
});

test('normalisation keeps only the characters a code is made of', () => {
    assert.equal(normalizeRecoveryCode('abcde-fghjk'), 'ABCDEFGHJK');
    assert.equal(normalizeRecoveryCode('AB CD E-FG HJK'), 'ABCDEFGHJK');
});

test('shape checking counts characters, not punctuation', () => {
    assert.equal(isWellFormedRecoveryCode('ABCDE-FGHJK'), true);
    assert.equal(isWellFormedRecoveryCode('abcdefghjk'), true);
    assert.equal(isWellFormedRecoveryCode('ABCDE-FGHJ'), false);
    assert.equal(isWellFormedRecoveryCode('123456'), false);
    assert.equal(isWellFormedRecoveryCode(undefined), false);
});
