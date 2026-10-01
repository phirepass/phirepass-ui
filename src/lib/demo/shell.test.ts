import assert from 'node:assert/strict';
import test from 'node:test';

import { createHost, lookup, resolvePath, writeFile, type HostProfile } from './host.ts';
import { DemoShell, renderHtop, tokenize } from './shell.ts';

/**
 * The demo shell is what `<phirepass-terminal>` talks to in demo mode, so it
 * is tested the way the widget uses it: bytes in, bytes out.
 */

const profile = (overrides: Partial<HostProfile> = {}): HostProfile => ({
    nodeId: 'node-1',
    hostname: 'edge-fra-01',
    platform: 'linux',
    osName: 'Ubuntu 24.04.1 LTS',
    kernel: '6.8.0-45-generic',
    arch: 'x86_64',
    user: 'deploy',
    localIp: '10.0.1.11',
    cidr: '10.0.1.0/24',
    gatewayIp: '10.0.1.1',
    iface: 'eth0',
    mac: '96:00:02:8c:41:aa',
    publicIp: '138.201.44.9',
    city: 'Frankfurt',
    uptimeDays: 96,
    load: [0.42, 0.51, 0.47],
    cpuPercent: 23,
    cores: 4,
    memTotalBytes: 16 * 1024 ** 3,
    memUsedFraction: 0.41,
    processes: 214,
    disks: [{ mount: '/', fsType: 'ext4', totalBytes: 160 * 1024 ** 3, usedFraction: 0.44 }],
    services: [
        { name: 'shell', kind: 'SSH', host: '0.0.0.0', port: 22, scheme: null },
        { name: 'Grafana', kind: 'HTTP', host: '127.0.0.1', port: 3000, scheme: 'http' },
    ],
    agentVersion: '0.4.19',
    ...overrides,
});

const plain = (text: string) => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g'), '');

function session(overrides: Partial<HostProfile> = {}) {
    const host = createHost(profile(overrides));
    let out = '';
    let exited = false;
    const shell = new DemoShell(host, {
        write: (data) => { out += data; },
        onExit: () => { exited = true; },
        now: () => Date.UTC(2026, 9, 1, 10, 0, 0),
        setInterval: () => 1,
        clearInterval: () => {},
    });
    return {
        host,
        shell,
        type(text: string) {
            out = '';
            shell.input(text);
            return plain(out);
        },
        get exited() { return exited; },
    };
}

test('the login lands in the home directory with a bash prompt', () => {
    const s = session();
    let banner = '';
    const shell = new DemoShell(s.host, { write: (data) => { banner += data; }, onExit: () => {} });
    shell.start();
    assert.match(plain(banner), /Welcome to Ubuntu 24\.04\.1 LTS/);
    assert.match(plain(banner), /deploy@edge-fra-01:~\$ $/);
});

test('typed characters are echoed, and Enter runs the line', () => {
    const s = session();
    assert.equal(s.type('pwd'), 'pwd');
    assert.match(s.type('\r'), /\/home\/deploy\r\n.*\$ $/);
});

test('cd and ls walk the same tree the file browser sees', () => {
    const s = session();
    s.type('cd deploy\r');
    assert.equal(s.shell.cwd, '/home/deploy/deploy');
    assert.match(s.type('ls\r'), /grafana/);
    assert.match(s.type('cd /nope\r'), /No such file or directory/);
});

test('a file written through the host shows up in the shell', () => {
    const s = session();
    writeFile(s.host, '/home/deploy/uploaded.txt', 'hello from sftp\n');
    assert.match(s.type('cat uploaded.txt\r'), /hello from sftp/);
});

test('redirection writes a file, and pipes filter output', () => {
    const s = session();
    s.type('echo first > note.txt\r');
    s.type('echo second >> note.txt\r');
    const entry = lookup(s.host, '/home/deploy/note.txt');
    assert.equal(entry?.type === 'file' && entry.content, 'first\nsecond\n');
    assert.equal(s.type('cat note.txt | grep sec\r').split('\r\n')[1], 'second');
});

test('backspace edits the line before it runs', () => {
    const s = session();
    s.type('whoamx\x7fi\r');
    assert.equal(s.shell.cwd, '/home/deploy');
    assert.match(s.type('\x1b[A'), /whoami/);
});

test('Tab completes a unique path', () => {
    const s = session();
    assert.match(s.type('cd dep\t'), /cd deploy\/$/);
});

test('an unknown command says so, as bash would', () => {
    const s = session();
    assert.match(s.type('frobnicate\r'), /frobnicate: command not found/);
});

test('curl reaches a local HTTP service on its port and is refused elsewhere', () => {
    const s = session();
    assert.match(s.type('curl localhost:3000/api/health\r'), /"service": "Grafana"/);
    assert.match(s.type('curl localhost:9999\r'), /Connection refused/);
});

test('htop takes over the screen and q gives it back', () => {
    const s = session();
    const screen = s.type('htop\r');
    assert.match(screen, /Load average:/);
    assert.match(screen, /phirepass-agent/);
    assert.match(s.type('q'), /\$ $/);
});

test('htop fits the terminal it is drawn into', () => {
    const host = createHost(profile());
    const lines = plain(renderHtop(host, 100, 30, Date.UTC(2026, 9, 1))).split('\r\n');
    assert.ok(lines.length <= 30);
});

test('exit ends the session', () => {
    const s = session();
    s.type('exit\r');
    assert.equal(s.exited, true);
});

test('the Windows box answers in PowerShell with drive-letter paths', () => {
    const s = session({ platform: 'windows', hostname: 'ACME-LAB-W11', user: 'labadmin', osName: 'Windows 11 Pro 23H2' });
    assert.match(s.type('pwd\r'), /C:\\Users\\labadmin/);
    s.type('cd Documents\r');
    assert.match(s.type('dir\r'), /Thesis draft v7\.docx/);
    assert.match(s.type('Get-Content notes.txt\r'), /Rerun batch 14/);
});

test('paths resolve relative to the working directory and home', () => {
    assert.equal(resolvePath('/home/deploy', '../x/./y', '/home/deploy'), '/home/x/y');
    assert.equal(resolvePath('/', '~/logs', '/home/deploy'), '/home/deploy/logs');
    assert.equal(resolvePath('/Users/a', 'C:\\Windows', '/Users/a'), '/Windows');
});

test('quotes keep spaces inside one argument', () => {
    assert.deepEqual(tokenize(`cat "Lab rules.txt" 'a b' c`), ['cat', 'Lab rules.txt', 'a b', 'c']);
});
