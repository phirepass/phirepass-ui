'use client';

/**
 * The session list, as React state.
 *
 * A thin wrapper over the pure rules in `sessions.ts` — every action here is one
 * of those functions and nothing else, which is what keeps the behaviour
 * testable without a browser. If a rule is being decided in this file, it is in
 * the wrong file.
 *
 * One instance, held by the nodes page, and read by all three panels. That is
 * the whole point: the terminal, the file browser and the remote desktop are
 * three views of one list, so "what is open" cannot disagree between them the
 * way it did when each kept its own.
 */

import { useCallback, useMemo, useState } from 'react';

import {
    closeNodeSessions,
    closeSession,
    disconnectSession,
    nextActiveId,
    openSession,
    reconnectSession,
    renameNodeSessions,
    sessionId,
    sessionsOfKind,
    setSessionStatus,
    type Session,
    type SessionKind,
    type SessionRequest,
    type SessionStatus,
} from './sessions';

export interface SessionsApi {
    sessions: Session[];
    /** The focused tab per kind. Independent, because the panels are. */
    activeIds: Record<SessionKind, string | null>;
    /** Open a service, or focus it if it is already open. Returns its id. */
    open: (request: SessionRequest) => string;
    focus: (kind: SessionKind, id: string) => void;
    /** The tab's ✕: end the session and drop the tab. */
    close: (id: string) => void;
    /** End the session, keep the tab so it can be reconnected. */
    disconnect: (id: string) => void;
    reconnect: (id: string) => void;
    setStatus: (id: string, status: SessionStatus, error?: string | null) => void;
    /** The sessions of one kind, for the panel that shows them. */
    ofKind: (kind: SessionKind) => Session[];
    /** Whether any session for this node and service is live, for the node card. */
    isLive: (kind: SessionKind, nodeId: string, serviceId: string) => boolean;
    /** Relabel every open tab on a node that was renamed. */
    renameNode: (nodeId: string, nodeName: string) => void;
    /** End every session on a node that has gone. */
    closeNode: (nodeId: string) => void;
}

const NO_ACTIVE: Record<SessionKind, string | null> = { ssh: null, sftp: null, rdp: null };

export function useSessions(): SessionsApi {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeIds, setActiveIds] = useState<Record<SessionKind, string | null>>(NO_ACTIVE);

    const open = useCallback((request: SessionRequest) => {
        const id = sessionId(request.kind, request.nodeId, request.serviceId);
        setSessions((current) => openSession(current, request));
        setActiveIds((current) => ({ ...current, [request.kind]: id }));
        return id;
    }, []);

    const focus = useCallback((kind: SessionKind, id: string) => {
        setActiveIds((current) => ({ ...current, [kind]: id }));
    }, []);

    const close = useCallback((id: string) => {
        setSessions((current) => {
            const closing = current.find((session) => session.id === id);
            if (!closing) {
                return current;
            }

            /*
             * The next focus is computed from the list as it was, because "the
             * tab to the left" is a fact about the order before the removal.
             * Doing it after would have to reconstruct that, and would get the
             * first-tab case wrong.
             */
            const nextId = nextActiveId(current, closing.kind, id);
            setActiveIds((active) => (active[closing.kind] === id
                ? { ...active, [closing.kind]: nextId }
                : active));

            return closeSession(current, id);
        });
    }, []);

    const disconnect = useCallback((id: string) => {
        setSessions((current) => disconnectSession(current, id));
    }, []);

    const reconnect = useCallback((id: string) => {
        setSessions((current) => reconnectSession(current, id));
    }, []);

    const setStatus = useCallback((id: string, status: SessionStatus, error: string | null = null) => {
        setSessions((current) => setSessionStatus(current, id, status, error));
    }, []);

    const ofKind = useCallback(
        (kind: SessionKind) => sessionsOfKind(sessions, kind),
        [sessions],
    );

    const isLive = useCallback((kind: SessionKind, nodeId: string, serviceId: string) => {
        const id = sessionId(kind, nodeId, serviceId);
        return sessions.some((session) => session.id === id && session.status !== 'disconnected');
    }, [sessions]);

    const renameNode = useCallback((nodeId: string, nodeName: string) => {
        setSessions((current) => renameNodeSessions(current, nodeId, nodeName));
    }, []);

    const closeNode = useCallback((nodeId: string) => {
        setSessions((current) => {
            // Focus is dropped for any kind whose focused tab belonged to the
            // node, rather than moved: the node is gone, so there is no
            // neighbouring tab on it to fall to.
            const going = new Set(current.filter((s) => s.nodeId === nodeId).map((s) => s.id));
            setActiveIds((active) => {
                const next = { ...active };
                (Object.keys(next) as SessionKind[]).forEach((kind) => {
                    if (next[kind] && going.has(next[kind]!)) {
                        next[kind] = closeNodeSessions(current, nodeId)
                            .find((s) => s.kind === kind)?.id ?? null;
                    }
                });
                return next;
            });

            return closeNodeSessions(current, nodeId);
        });
    }, []);

    return useMemo(
        () => ({
            sessions, activeIds, open, focus, close, disconnect, reconnect,
            setStatus, ofKind, isLive, renameNode, closeNode,
        }),
        [
            sessions, activeIds, open, focus, close, disconnect, reconnect,
            setStatus, ofKind, isLive, renameNode, closeNode,
        ],
    );
}
