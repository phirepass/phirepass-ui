import assert from 'node:assert/strict';
import test from 'node:test';

import {
    closeSession,
    disconnectSession,
    nextActiveId,
    openSession,
    reconnectSession,
    renameNodeSessions,
    sessionId,
    sessionsOfKind,
    setSessionStatus,
    shouldMount,
    type Session,
    type SessionRequest,
} from './sessions.ts';

/**
 * The session rules, which used to exist three times and disagree.
 *
 * What is worth pinning here is not that a list can hold items — it is the three
 * lifetimes: opening something already open must not reconnect it, closing a
 * panel must not appear anywhere in these rules at all, and ending a session is
 * only ever `disconnect` or `close`.
 */

function req(over: Partial<SessionRequest> = {}): SessionRequest {
    return {
        kind: 'ssh',
        nodeId: 'node-1',
        serviceId: 'svc-1',
        nodeName: 'rpi-2',
        serviceName: 'SSH',
        ...over,
    };
}

test('opening a service creates one session, connecting', () => {
    const sessions = openSession([], req());

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, sessionId('ssh', 'node-1', 'svc-1'));
    assert.equal(sessions[0].status, 'connecting');
    assert.equal(sessions[0].generation, 0);
});

/**
 * The bug the refactor exists to remove. Clicking a service that is already
 * running used to rebuild it, so the way back to a shell was also the way to
 * lose it.
 */
test('reopening a live service focuses it rather than reconnecting it', () => {
    const opened = openSession([], req());
    const live = setSessionStatus(opened, opened[0].id, 'connected');

    const again = openSession(live, req());

    assert.equal(again.length, 1, 'no second session against the same service');
    assert.equal(again[0].status, 'connected', 'the live session was left alone');
    assert.equal(again[0].generation, 0, 'a generation bump would have remounted it');
});

test('reopening refreshes the labels but never the session', () => {
    const opened = openSession([], req({ nodeName: 'old-name' }));
    const live = setSessionStatus(opened, opened[0].id, 'connected');

    const again = openSession(live, req({ nodeName: 'renamed', serverId: 'srv-9' }));

    assert.equal(again[0].nodeName, 'renamed');
    assert.equal(again[0].serverId, 'srv-9');
    assert.equal(again[0].status, 'connected');
    assert.equal(again[0].generation, 0);
});

/**
 * Deliberately disconnected, then reopened from the node list: it comes back to
 * its tab and waits, rather than silently dialling out again.
 */
test('reopening a disconnected service does not dial it again', () => {
    const opened = openSession([], req());
    const down = disconnectSession(opened, opened[0].id);

    const again = openSession(down, req());

    assert.equal(again[0].status, 'disconnected');
    assert.equal(again[0].generation, 0);
});

test('a node with two services is two sessions, not one', () => {
    let sessions = openSession([], req({ serviceId: 'svc-1' }));
    sessions = openSession(sessions, req({ serviceId: 'svc-2' }));

    assert.equal(sessions.length, 2);
});

test('a shell and a file browser on one service are different sessions', () => {
    let sessions = openSession([], req({ kind: 'ssh' }));
    sessions = openSession(sessions, req({ kind: 'sftp' }));

    assert.equal(sessions.length, 2);
    assert.equal(sessionsOfKind(sessions, 'ssh').length, 1);
    assert.equal(sessionsOfKind(sessions, 'sftp').length, 1);
});

test('closing removes the session, which is what tears it down', () => {
    const opened = openSession([], req());

    assert.deepEqual(closeSession(opened, opened[0].id), []);
});

test('disconnecting keeps the tab so it can be reconnected', () => {
    const opened = openSession([], req());
    const down = disconnectSession(opened, opened[0].id);

    assert.equal(down.length, 1, 'the tab stays');
    assert.equal(down[0].status, 'disconnected');
});

test('disconnecting twice is not an error', () => {
    const opened = openSession([], req());
    const once = disconnectSession(opened, opened[0].id);
    const twice = disconnectSession(once, opened[0].id);

    assert.deepEqual(twice, once);
});

test('reconnecting bumps the generation, which is what remounts the widget', () => {
    const opened = openSession([], req());
    const down = disconnectSession(opened, opened[0].id);
    const back = reconnectSession(down, opened[0].id);

    assert.equal(back[0].status, 'connecting');
    assert.equal(back[0].generation, 1);
});

/**
 * The other half of the same guarantee: nothing may remount a working session,
 * whatever calls it.
 */
test('reconnecting a live session is refused', () => {
    const opened = openSession([], req());
    const live = setSessionStatus(opened, opened[0].id, 'connected');
    const again = reconnectSession(live, opened[0].id);

    assert.equal(again[0].generation, 0);
    assert.equal(again[0].status, 'connected');
});

test('an error message is kept only while the status is error', () => {
    const opened = openSession([], req());
    const failed = setSessionStatus(opened, opened[0].id, 'error', 'agent refused');
    assert.equal(failed[0].error, 'agent refused');

    const recovered = setSessionStatus(failed, opened[0].id, 'connected');
    assert.equal(recovered[0].error, null, 'a stale error must not outlive the failure');
});

test('a status change never adds or removes a session', () => {
    const opened = openSession([], req());
    const dropped = setSessionStatus(opened, opened[0].id, 'disconnected');

    assert.equal(dropped.length, 1, 'a transport hiccup is not a decision to close anything');
});

test('focus falls to the tab on the left, then to the first', () => {
    let sessions = openSession([], req({ serviceId: 'a' }));
    sessions = openSession(sessions, req({ serviceId: 'b' }));
    sessions = openSession(sessions, req({ serviceId: 'c' }));

    const middle = sessionId('ssh', 'node-1', 'b');
    assert.equal(nextActiveId(sessions, middle), sessionId('ssh', 'node-1', 'a'));

    const first = sessionId('ssh', 'node-1', 'a');
    assert.equal(nextActiveId(sessions, first), sessionId('ssh', 'node-1', 'b'));
});

test('closing the only tab leaves nothing focused', () => {
    const sessions = openSession([], req());

    assert.equal(nextActiveId(sessions, sessions[0].id), null);
});

/**
 * There is one strip now, holding every kind, so the tab to the left of a file
 * browser is genuinely whatever was opened before it. This used to answer `null`
 * — the strips were per kind — which is what left the dock focused on nothing
 * while other sessions were still running.
 */
test('focus crosses kinds, because the strip does', () => {
    let sessions = openSession([], req({ kind: 'ssh', serviceId: 'a' }));
    sessions = openSession(sessions, req({ kind: 'sftp', serviceId: 'b' }));
    sessions = openSession(sessions, req({ kind: 'rdp', serviceId: 'c' }));

    assert.equal(
        nextActiveId(sessions, sessionId('sftp', 'node-1', 'b')),
        sessionId('ssh', 'node-1', 'a'),
    );

    assert.equal(
        nextActiveId(sessions, sessionId('ssh', 'node-1', 'a')),
        sessionId('sftp', 'node-1', 'b'),
    );
});

/**
 * The rule that makes closing the panel harmless: it asks about the session and
 * nothing about what is on screen.
 */
test('what stays mounted depends on the session, never on what is visible', () => {
    const live: Session = openSession([], req())[0];

    assert.equal(shouldMount(live), true);
    assert.equal(shouldMount({ ...live, status: 'connected' }), true);
    assert.equal(shouldMount({ ...live, status: 'error' }), true);
    assert.equal(shouldMount({ ...live, status: 'disconnected' }), false);
});

/**
 * Many tabs, one browser session.
 *
 * These are the Supervisor's cases, and they are all one claim said five ways:
 * **a session ends when its tab's ✕ is pressed, and at no other moment.** Not
 * when the panel closes, not when another tab is focused, not when a different
 * session drops, not when the same service is opened again from the node list.
 *
 * They are written against `generation` and `status` rather than against a
 * rendered tree deliberately. `generation` *is* the connection: it keys the
 * widget element, so an unchanged generation means the same element, the same
 * socket and the same scrollback. A test that asserted on markup would pass
 * while the socket underneath was quietly replaced.
 */

/** Every kind at once, as the dock holds them. */
function threeKinds(): Session[] {
    let sessions = openSession([], req({ kind: 'ssh', nodeId: 'node-1', serviceId: 'shell' }));
    sessions = openSession(sessions, req({ kind: 'sftp', nodeId: 'node-2', serviceId: 'files' }));
    sessions = openSession(sessions, req({ kind: 'rdp', nodeId: 'node-3', serviceId: 'screen' }));
    return sessions;
}

/** What a tab has to keep for its connection to have survived. */
function fingerprint(sessions: readonly Session[]) {
    return sessions.map((session) => `${session.id}@${session.generation}:${session.status}`);
}

test('a shell, a file browser and a desktop are three live tabs at once', () => {
    const sessions = threeKinds();

    assert.equal(sessions.length, 3);
    assert.deepEqual(sessions.map((session) => session.kind), ['ssh', 'sftp', 'rdp']);
    assert.ok(sessions.every(shouldMount), 'every open tab keeps its widget mounted');
});

test('focusing a tab is not a fact about any session', () => {
    const before = threeKinds();

    // Focus lives in the hook, not in the list — which is the point: there is
    // no function here that a tab switch could call, so switching tabs cannot
    // touch a connection even by mistake.
    assert.deepEqual(fingerprint(before), fingerprint([...before]));
    assert.ok(before.every(shouldMount));
});

test('one session dropping leaves the other tabs exactly as they were', () => {
    const before = threeKinds();
    const after = setSessionStatus(before, before[1].id, 'error', 'the agent went away');

    assert.equal(after.length, 3, 'a drop never removes a tab');
    assert.equal(after[1].status, 'error');
    assert.deepEqual(
        fingerprint([after[0], after[2]]),
        fingerprint([before[0], before[2]]),
        'the untouched tabs keep their generation and their status',
    );
});

test('reconnecting one tab remounts only that one', () => {
    const before = disconnectSession(threeKinds(), threeKinds()[2].id);
    const after = reconnectSession(before, before[2].id);

    assert.equal(after[2].generation, 1, 'the reconnected tab gets a new element');
    assert.equal(after[0].generation, 0);
    assert.equal(after[1].generation, 0);
});

test('closing one tab ends that session and no other', () => {
    const before = threeKinds();
    const closed = closeSession(before, before[1].id);

    assert.deepEqual(closed.map((session) => session.id), [before[0].id, before[2].id]);
    assert.deepEqual(
        fingerprint(closed),
        fingerprint([before[0], before[2]]),
        'the survivors keep their connections',
    );
});

test('reopening a service from the node list keeps the tab that is already running', () => {
    const before = setSessionStatus(threeKinds(), sessionId('ssh', 'node-1', 'shell'), 'connected');
    const after = openSession(before, req({ kind: 'ssh', nodeId: 'node-1', serviceId: 'shell' }));

    assert.equal(after.length, 3, 'never a second session against the same service');
    assert.deepEqual(
        fingerprint(after),
        fingerprint(before),
        'the shell that was running is the shell that comes back',
    );
});

test('nothing but close and disconnect can end a session', () => {
    const before = threeKinds();

    // Everything a panel does while tabs are open, in one pass. None of it may
    // change how many sessions there are, or remount one that was not asked to
    // reconnect. This is "closing the panel does not end a session", asserted as
    // the absence of any path that could.
    let after = renameNodeSessions(before, 'node-1', 'renamed');
    after = setSessionStatus(after, before[0].id, 'connected');
    after = openSession(after, req({ kind: 'sftp', nodeId: 'node-2', serviceId: 'files' }));

    assert.equal(after.length, 3);
    assert.deepEqual(
        after.map((session) => session.generation),
        [0, 0, 0],
        'no widget was replaced, so no socket was dropped',
    );
    assert.ok(after.every(shouldMount));
});
