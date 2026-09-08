/**
 * Every live service session, in one list with one set of rules.
 *
 * Terminal, SFTP and RDP each grew their own tab bookkeeping, in three different
 * places: the terminal kept `cachedSessions` inside its own panel, while SFTP
 * and RDP had their tabs held by the page. Three copies of "what is open" is why
 * they behaved differently — reopening a service reconnected in one and not
 * another, closing the panel dropped a session in one and not another — and it
 * is why fixing it in one never fixed it in the others.
 *
 * So the rules live here, once, as pure functions over a `Session[]`. No React,
 * no imports, so `sessions.test.ts` can run them under the bare `node --test`
 * runner — the same reason `scope.ts` and `share-services.ts` are shaped this
 * way. The hook is `use-sessions.ts`; the panels are views.
 *
 * **The three lifetimes, and they are genuinely different:**
 *
 * - **Closing the panel does nothing to a session.** The panel is a window onto
 *   the list, not the thing that owns it. This is the one people notice: going
 *   back to the node list and returning must not kill a shell.
 * - **Reopening a service focuses what is already there.** Never a second
 *   session against the same service, and never a reconnect — that is what made
 *   "open SSH again" drop the session that was already running.
 * - **Ending one is always deliberate.** `disconnect` tears the session down and
 *   keeps the tab, so it can be reconnected; `close` — the tab's ✕ — tears it
 *   down and removes the tab. Nothing else ends a session.
 */

export type SessionKind = 'ssh' | 'sftp' | 'rdp';

/**
 * Where a session is.
 *
 * `disconnected` is a session that still has a tab and no live socket — what
 * `disconnect` leaves behind, and where an unexpected drop lands. It is a
 * resting state with a way out (reconnect), not an error.
 */
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Session {
    /** `${kind}:${nodeId}:${serviceId}` — see `sessionId`. */
    id: string;
    kind: SessionKind;
    nodeId: string;
    serverId: string | null;
    serviceId: string;
    nodeName: string;
    serviceName: string | null;
    /**
     * `host:port` from the service settings, RDP only. The agent dials from
     * those same settings, so this never affects routing — it is only what the
     * browser names in the CredSSP service principal, which some hosts check.
     *
     * Absent for a node somebody was given rather than owns: the services route
     * withholds host and port from a grantee, and nothing on this path needs
     * them.
     */
    destination?: string;
    status: SessionStatus;
    error: string | null;
    /**
     * Bumped to remount the widget, which is how a reconnect happens.
     *
     * The widgets own their socket for their lifetime and expose no reopen, so
     * "connect again" is "be a new element" — the React key carries this, and
     * incrementing it is the whole mechanism. It must **not** change for
     * anything else, or every unrelated state update would drop the session.
     */
    generation: number;
}

/** What opening a service supplies. Everything else is derived or defaulted. */
export interface SessionRequest {
    kind: SessionKind;
    nodeId: string;
    serverId?: string | null;
    serviceId: string;
    nodeName: string;
    serviceName?: string | null;
    destination?: string;
}

/**
 * One session per service, and the id says so.
 *
 * Keyed on the service rather than on the node: a node with two SSH services is
 * two sessions, and opening the second must not focus the first. Keyed with the
 * kind because a node's SFTP and its shell are different sessions that can share
 * a service id.
 */
export function sessionId(kind: SessionKind, nodeId: string, serviceId: string): string {
    return `${kind}:${nodeId}:${serviceId}`;
}

/**
 * Open a service, or focus it if it is already open.
 *
 * **Never reconnects an existing session**, which is the bug this replaces:
 * clicking a service that was already running used to rebuild it, so the way to
 * get back to a shell was also the way to lose it. An existing session keeps its
 * `generation`, its `status` and its socket; only the labels are refreshed, in
 * case the node was renamed while it was open.
 *
 * A session that had been disconnected is *not* reconnected here either. It
 * comes back to a tab that says so and offers the button, because reopening
 * something you deliberately disconnected should not silently dial out again.
 */
export function openSession(sessions: readonly Session[], request: SessionRequest): Session[] {
    const id = sessionId(request.kind, request.nodeId, request.serviceId);
    const existing = sessions.find((session) => session.id === id);

    if (existing) {
        return sessions.map((session) => (session.id === id
            ? {
                ...session,
                // Refreshed, because these are display and can go stale; never
                // `status` or `generation`, which are the session itself.
                serverId: request.serverId ?? session.serverId,
                nodeName: request.nodeName || session.nodeName,
                serviceName: request.serviceName ?? session.serviceName,
                destination: request.destination ?? session.destination,
            }
            : session));
    }

    return [
        ...sessions,
        {
            id,
            kind: request.kind,
            nodeId: request.nodeId,
            serverId: request.serverId ?? null,
            serviceId: request.serviceId,
            nodeName: request.nodeName,
            serviceName: request.serviceName ?? null,
            destination: request.destination,
            status: 'connecting',
            error: null,
            generation: 0,
        },
    ];
}

/**
 * End a session and remove its tab. The ✕.
 *
 * Removal from the list is what tears the socket down: the widget is rendered
 * from the list, so a session that is not in it has no element and therefore no
 * connection. That is the whole teardown, and it is why nothing else may remove
 * an entry.
 */
export function closeSession(sessions: readonly Session[], id: string): Session[] {
    return sessions.filter((session) => session.id !== id);
}

/**
 * End a session and keep its tab.
 *
 * The tab stays so the session can be reconnected without going back to the node
 * list to find the service again. Already-disconnected is left alone rather than
 * re-marked, so this is safe to call twice.
 */
export function disconnectSession(sessions: readonly Session[], id: string): Session[] {
    return sessions.map((session) => (session.id === id && session.status !== 'disconnected'
        ? { ...session, status: 'disconnected', error: null }
        : session));
}

/**
 * Dial again on a tab that is not connected.
 *
 * The `generation` bump is the mechanism: it changes the React key, the old
 * element is dropped and a new one mounts and connects. Refused on a session
 * that is already live, because remounting a working shell to "reconnect" it is
 * the failure mode this whole module exists to remove.
 */
export function reconnectSession(sessions: readonly Session[], id: string): Session[] {
    return sessions.map((session) => (session.id === id && session.status !== 'connected'
        ? { ...session, status: 'connecting', error: null, generation: session.generation + 1 }
        : session));
}

/**
 * Record what a widget reported about its own connection.
 *
 * Only ever moves `status`; it never adds or removes a session, because a
 * transport hiccup is not a decision to close anything. An `error` message is
 * kept only alongside the `error` status, so a later success cannot leave a
 * stale one on screen.
 */
export function setSessionStatus(
    sessions: readonly Session[],
    id: string,
    status: SessionStatus,
    error: string | null = null,
): Session[] {
    return sessions.map((session) => (session.id === id
        ? { ...session, status, error: status === 'error' ? error : null }
        : session));
}

/**
 * Follow a node being renamed.
 *
 * Tabs are labelled from the session, not looked up against the node list, so
 * without this a renamed machine keeps its old name on every open tab until they
 * are closed — which reads as the rename having half worked.
 */
export function renameNodeSessions(
    sessions: readonly Session[],
    nodeId: string,
    nodeName: string,
): Session[] {
    return sessions.map((session) => (session.nodeId === nodeId ? { ...session, nodeName } : session));
}

/**
 * End every session on a node, for when the node itself goes.
 *
 * A deleted node cannot be reconnected to, so these are closed rather than
 * disconnected: leaving tabs with a Reconnect button for a machine that no
 * longer exists offers something that can only fail.
 */
export function closeNodeSessions(sessions: readonly Session[], nodeId: string): Session[] {
    return sessions.filter((session) => session.nodeId !== nodeId);
}

/** The sessions of one kind, in the order they were opened. */
export function sessionsOfKind(sessions: readonly Session[], kind: SessionKind): Session[] {
    return sessions.filter((session) => session.kind === kind);
}

/**
 * Which tab to focus after `closedId` goes, given the tabs as they were.
 *
 * The one to its left, falling back to the first — the behaviour every tabbed
 * thing has, and the reason this is a function rather than "just take the last":
 * closing a middle tab and being thrown to the far end is disorienting.
 *
 * `null` when nothing of that kind is left.
 */
export function nextActiveId(
    sessions: readonly Session[],
    kind: SessionKind,
    closedId: string,
): string | null {
    const ofKind = sessionsOfKind(sessions, kind);
    const index = ofKind.findIndex((session) => session.id === closedId);
    const remaining = ofKind.filter((session) => session.id !== closedId);

    if (remaining.length === 0) {
        return null;
    }

    return (remaining[Math.max(0, index - 1)] ?? remaining[0]).id;
}

/**
 * Whether a session should have a live widget mounted.
 *
 * The rule that makes closing the panel harmless: it asks about the *session*
 * and nothing about what is on screen. Panels hide inactive sessions with
 * opacity, never `display: none` — a widget in a `display: none` subtree has no
 * layout, which for a terminal means it fits itself to a zero-height box and
 * comes back the wrong size.
 */
export function shouldMount(session: Session): boolean {
    return session.status !== 'disconnected';
}
