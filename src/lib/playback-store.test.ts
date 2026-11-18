import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apiPositionStore } from './playback-store.ts';

type Call = { url: string; init?: RequestInit };

function fake(answer: unknown, ok = true) {
    const calls: Call[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return { ok, json: async () => answer } as Response;
    }) as unknown as typeof fetch;
    return { calls, store: apiPositionStore(fetcher) };
}

const KEY = 'node:0b6d6a5e-3c1f-4a52-9d8e-2b7f1c9a4e10:/films/a b.mp4';

test('get reads the position, and nothing when there is none or the call fails', async () => {
    const pos = { secs: 760, duration: 3600, at: 1 };
    const a = fake({ position: pos });
    assert.deepEqual(await a.store.get(KEY), pos);
    assert.equal(a.calls[0].url, `/api/playback?key=${encodeURIComponent(KEY)}`);
    assert.equal(await fake({ position: null }).store.get(KEY), null);
    assert.equal(await fake({}, false).store.get(KEY), null);
});

test('set sends a finite duration; clear deletes', async () => {
    const f = fake({ result: 'saved' });
    await f.store.set(KEY, 61, Number.POSITIVE_INFINITY);
    assert.equal(f.calls[0].init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(f.calls[0].init?.body)), { key: KEY, secs: 61, duration: 0 });
    await f.store.clear(KEY);
    assert.equal(f.calls[1].init?.method, 'DELETE');
});
