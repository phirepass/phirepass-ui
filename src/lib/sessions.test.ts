import assert from 'node:assert/strict';
import test from 'node:test';

import {
    closeSession,
    disconnectSession,
    nextActiveId,
    openSession,
    reconnectSession,
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
    assert.equal(nextActiveId(sessions, 'ssh', middle), sessionId('ssh', 'node-1', 'a'));

    const first = sessionId('ssh', 'node-1', 'a');
    assert.equal(nextActiveId(sessions, 'ssh', first), sessionId('ssh', 'node-1', 'b'));
});

test('closing the only tab of a kind leaves nothing focused', () => {
    const sessions = openSession([], req());

    assert.equal(nextActiveId(sessions, 'ssh', sessions[0].id), null);
});

test('focus stays within a kind', () => {
    let sessions = openSession([], req({ kind: 'ssh', serviceId: 'a' }));
    sessions = openSession(sessions, req({ kind: 'sftp', serviceId: 'b' }));

    assert.equal(nextActiveId(sessions, 'ssh', sessionId('ssh', 'node-1', 'a')), null);
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
