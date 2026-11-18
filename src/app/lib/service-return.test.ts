import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServiceReturnCookie, safeServiceUrl } from './service-return.ts';

const DOMAIN = 'http.proxy.phirepass.com';
const NODE = '3f2b1c9e-8a4d-4e6f-9b1a-0c2d3e4f5a6b';

const check = (raw: string | null, production = true) => safeServiceUrl(raw, DOMAIN, production);

test('accepts a service on its own subdomain, path and query intact', () => {
    const url = `https://${NODE}.${DOMAIN}/lovelace/0?kiosk=1`;
    assert.equal(check(url), url);
});

test('accepts the path form of the proxy', () => {
    const url = `https://${DOMAIN}/api/web/http/${NODE}/app`;
    assert.equal(check(url), url);
    assert.equal(check(`https://${DOMAIN}/api/web/http/${NODE}`), `https://${DOMAIN}/api/web/http/${NODE}`);
});

test('refuses everything that is not a proxied service', () => {
    for (const url of [
        null,
        '',
        '/dashboard/nodes',
        '//evil.example',
        'not a url',
        'https://evil.example/',
        'https://www.phirepass.com/dashboard',
        `https://${DOMAIN}/`,
        `https://${DOMAIN}/api/web/http/not-a-uuid/`,
        `https://${DOMAIN}/api/web/http/${NODE}evil`,
        `https://notauuid.${DOMAIN}/`,
        `https://evil.${NODE}.${DOMAIN}/`,
        `https://${NODE}.${DOMAIN}.evil.example/`,
        `https://${NODE}.evil${DOMAIN}/`,
        `https://evil.example/${NODE}.${DOMAIN}/`,
        `https://${NODE}.${DOMAIN}@evil.example/`,
        `https://user:pass@${NODE}.${DOMAIN}/`,
        `javascript:alert(1)//${NODE}.${DOMAIN}/`,
    ]) {
        assert.equal(check(url), null, String(url));
    }
});

test('production refuses plain http and a non-standard port', () => {
    assert.equal(check(`http://${NODE}.${DOMAIN}/`), null);
    assert.equal(check(`https://${NODE}.${DOMAIN}:8443/`), null);
});

test('development allows both, for a local relay', () => {
    const url = `http://${NODE}.localhost:8080/`;
    assert.equal(safeServiceUrl(url, 'localhost', false), url);
});

test('refuses an address too long for the cookie', () => {
    assert.equal(check(`https://${NODE}.${DOMAIN}/${'a'.repeat(2048)}`), null);
});

test('the cookie is never scoped to the domain the proxy shares', () => {
    assert.doesNotMatch(buildServiceReturnCookie(`https://${NODE}.${DOMAIN}/`), /Domain=/i);
});
