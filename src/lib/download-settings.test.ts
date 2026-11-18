import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DEFAULT_DOWNLOAD_SETTINGS,
    checkSettings,
    defaultWindow,
    fieldRefusal,
    hhmm,
    minutesOf,
    settingsStatus,
    type NodeSettingsView,
} from './download-settings.ts';

const here = new URL('.', import.meta.url);
const shared = (path: URL) => JSON.parse(readFileSync(path, 'utf8')) as unknown;

test('the defaults are the shared JSON', () => {
    assert.deepEqual(DEFAULT_DOWNLOAD_SETTINGS, shared(new URL('download-settings-default.json', here)));
});

test("the shared JSON is the Rust crate's, when the two repos sit side by side", (t) => {
    const rust = new URL('../../../phirepass-rs/common/src/protocol/download-settings-default.json', here);
    if (!existsSync(rust)) {
        t.skip('phirepass-rs is not beside this repo');
        return;
    }
    assert.deepEqual(shared(new URL('download-settings-default.json', here)), shared(rust));
});

test('the form refuses what the server would, with its sentence', () => {
    const ok = { ...DEFAULT_DOWNLOAD_SETTINGS, folder: '/srv/downloads' };
    assert.equal(checkSettings(ok), null);
    assert.equal(checkSettings(DEFAULT_DOWNLOAD_SETTINGS), null, 'no folder yet is allowed');
    assert.equal(checkSettings({ ...ok, folder: 'downloads' })?.field, 'folder');
    assert.deepEqual(checkSettings({ ...ok, max_active: 0 }), {
        field: 'max_active',
        reason: 'Between 1 and 20 downloads can run at once.',
    });
    assert.equal(checkSettings({ ...ok, stall_secs: 5 })?.field, 'stall_secs');
    assert.equal(checkSettings({ ...ok, max_jobs: 2.5 })?.field, 'max_jobs');
    assert.equal(checkSettings({ ...ok, window: { ...defaultWindow('UTC'), days: 0 } })?.field, 'window');
    assert.equal(checkSettings({ ...ok, window: defaultWindow('Europe/Athens') }), null);
});

const view = (over: Partial<NodeSettingsView>): NodeSettingsView => ({
    version: 2,
    applied_version: 1,
    settings: DEFAULT_DOWNLOAD_SETTINGS,
    rejected: null,
    ...over,
});

test('the status line follows the node', () => {
    assert.equal(settingsStatus(view({ version: 0, applied_version: 0 }), true, 'raspberrypi'), null);
    assert.equal(settingsStatus(view({}), false, 'raspberrypi'), 'Saved, applies when raspberrypi is online.');
    assert.equal(settingsStatus(view({}), true, 'raspberrypi'), 'Saved, applying on raspberrypi…');
    assert.equal(settingsStatus(view({ applied_version: 2 }), true, 'raspberrypi'), 'Applied on raspberrypi.');
    const refused = view({ rejected: { version: 2, field: 'folder', reason: 'A system folder can’t hold downloads.' } });
    assert.equal(settingsStatus(refused, true, 'raspberrypi'), 'raspberrypi kept its previous settings.');
});

test("a refusal shows under its field, and only for the latest save", () => {
    const rejected = { version: 2, field: 'folder', reason: 'No.' };
    assert.equal(fieldRefusal(view({ rejected }), 'folder'), 'No.');
    assert.equal(fieldRefusal(view({ rejected }), 'max_active'), null);
    assert.equal(fieldRefusal(view({ version: 3, rejected }), 'folder'), null);
});

test('window times read and print as HH:MM', () => {
    assert.equal(hhmm(0), '00:00');
    assert.equal(hhmm(7 * 60 + 5), '07:05');
    assert.equal(minutesOf('23:59'), 1439);
    assert.equal(minutesOf('24:00'), null);
    assert.equal(minutesOf('7'), null);
});
