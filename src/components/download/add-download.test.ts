import assert from 'node:assert/strict';
import test from 'node:test';

import { loginHost, readLink, readLogin, type LoginFields } from './add-download.ts';

test('an empty box is not an error yet', () => {
    assert.deepEqual(readLink('   ', true), { ok: false, message: null });
});

test('an https link becomes an Http source', () => {
    assert.deepEqual(readLink(' https://example.org/a.iso ', false), {
        ok: true,
        source: { Http: { url: 'https://example.org/a.iso', save_as: null } },
    });
});

test('a magnet needs Torrents on the node, and a hash', () => {
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=x';
    assert.deepEqual(readLink(magnet, false), { ok: false, message: 'Torrents are off on this node.' });
    assert.deepEqual(readLink(magnet, true), { ok: true, source: { Magnet: { uri: magnet } } });
    assert.equal(readLink('magnet:?dn=x', true).ok, false);
});

test('other schemes and links with a login are refused with a reason', () => {
    const ftp = readLink('ftp://example.org/a', true);
    assert.ok(!ftp.ok && ftp.message?.includes('http'));
    const login = readLink('https://me:secret@example.org/a', true);
    assert.ok(!login.ok && login.message?.includes('login'));
    assert.equal(readLink('not a link', true).ok, false);
});

const fields = (over: Partial<LoginFields>): LoginFields => ({
    username: '', password: '', token: '', name: '', value: '', ...over,
});

test('each form of login becomes the wire shape', () => {
    assert.deepEqual(readLogin('none', fields({ token: 'ignored' })), { ok: true, auth: null });
    assert.deepEqual(readLogin('basic', fields({ username: 'ana', password: 'p' })),
        { ok: true, auth: { Basic: { username: 'ana', password: 'p' } } });
    assert.deepEqual(readLogin('bearer', fields({ token: ' t-1 ' })), { ok: true, auth: { Bearer: { token: 't-1' } } });
    assert.deepEqual(readLogin('header', fields({ name: 'X-Api-Key', value: 'k' })),
        { ok: true, auth: { Header: { name: 'X-Api-Key', value: 'k' } } });
});

test('a login the node would refuse is refused here first', () => {
    assert.deepEqual(readLogin('header', fields({ name: 'Range', value: 'bytes=0-' })),
        { ok: false, message: 'That header cannot carry a login.' });
    assert.deepEqual(readLogin('header', fields({ name: 'X Key', value: 'k' })),
        { ok: false, message: 'That is not a header name.' });
    assert.deepEqual(readLogin('bearer', fields({ token: 'a\r\nX-Evil: 1' })),
        { ok: false, message: 'A login cannot contain line breaks.' });
    assert.deepEqual(readLogin('basic', fields({ username: 'a:b' })),
        { ok: false, message: 'A username cannot contain a colon.' });
    assert.deepEqual(readLogin('bearer', fields({})), { ok: false, message: null });
});

test('the note names the host the login goes to', () => {
    assert.equal(loginHost('https://git.example.com:8443/a.tar'), 'git.example.com:8443');
});
