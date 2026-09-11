'use client';

/**
 * The session list, as React state.
 *
 * A thin wrapper over the pure rules in `sessions.ts` — every action here is one
 * of those functions and nothing else, which is what keeps the behaviour
 * testable without a browser. If a rule is being decided in this file, it is in
 * the wrong file.
 *
 * One instance, held by the nodes page, and read by the dock. That is the whole
 * point: the terminal, the file browser and the remote desktop are three views
 * of one list, so "what is open" cannot disagree between them the way it did
 * when each kept its own.
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
    /**
     * The focused tab. One, not one per kind.
     *
     * The panels used to be three overlays with three strips, so "which tab"
     * was three answers — and opening a file browser while a shell was open
     * focused a tab in a panel painted underneath the one on screen, which read
     * as the tab never having appeared. There is one strip now, so there is one
     * answer.
     */
    activeId: string | null;
    /** Open a service, or focus it if it is already open. Returns its id. */
    open: (request: SessionRequest) => string;
    focus: (id: string) => void;
    /** The tab's ✕: end the session and drop the tab. */
    close: (id: string) => void;
    /** End the session, keep the tab so it can be reconnected. */
    disconnect: (id: string) => void;
    reconnect: (id: string) => void;
    setStatus: (id: string, status: SessionStatus, error?: string | null) => void;
    /** The sessions of one kind, for the body that renders them. */
    ofKind: (kind: SessionKind) => Session[];
    /** Whether any session for this node and service is live, for the node card. */
    isLive: (kind: SessionKind, nodeId: string, serviceId: string) => boolean;
    /** Relabel every open tab on a node that was renamed. */
    renameNode: (nodeId: string, nodeName: string) => void;
    /** End every session on a node that has gone. */
    closeNode: (nodeId: string) => void;
}

export function useSessions(): SessionsApi {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const open = useCallback((request: SessionRequest) => {
        const id = sessionId(request.kind, request.nodeId, request.serviceId);
        setSessions((current) => openSession(current, request));
        setActiveId(id);
        return id;
    }, []);

    const focus = useCallback((id: string) => {
        setActiveId(id);
    }, []);

    const close = useCallback((id: string) => {
        /*
         * Focus is decided from the list as it is now, outside the updater.
         *
         * "The tab to the left" is a fact about the order *before* the removal,
         * and computing it here rather than inside `setSessions` keeps this
         * function free of a state setter called from another setter's updater —
         * which React runs twice in development and is not a place for effects.
         */
        setSessions((current) => {
            if (!current.some((session) => session.id === id)) {
                return current;
            }

            return closeSession(current, id);
        });

        setActiveId((current) => (current === id ? nextActiveId(sessions, id) : current));
    }, [sessions]);

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
        setSessions((current) => closeNodeSessions(current, nodeId));

        // Focus moves to whatever is left rather than to a neighbour: the node
        // is gone, so the tab that was focused has no neighbour on it to fall
        // to. The remaining list is the honest answer.
        setActiveId((current) => {
            const focused = sessions.find((session) => session.id === current);
            if (!focused || focused.nodeId !== nodeId) {
                return current;
            }

            return closeNodeSessions(sessions, nodeId)[0]?.id ?? null;
        });
    }, [sessions]);

    return useMemo(
        () => ({
            sessions, activeId, open, focus, close, disconnect, reconnect,
            setStatus, ofKind, isLive, renameNode, closeNode,
        }),
        [
            sessions, activeId, open, focus, close, disconnect, reconnect,
            setStatus, ofKind, isLive, renameNode, closeNode,
        ],
    );
}
