'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { MonitorInput, MonitorSummary } from '@/types/monitor';

import { readError } from './use-monitor-data';

/**
 * Every mutation a monitor supports, plus the dialog state that drives them.
 *
 * Shared because the overview and the per-kind pages both create monitors, and
 * the per-kind pages also edit, pause, delete and force a check. Keeping one
 * implementation is what stops the two pages drifting into different toasts and
 * different refresh behaviour for the same action.
 */
export interface MonitorActions {
    formOpen: boolean;
    editing: MonitorSummary | null;
    detailMonitorId: string | null;
    monitorToDelete: MonitorSummary | null;
    deleting: boolean;
    checkingId: string | null;

    openCreate: () => void;
    openEdit: (monitor: MonitorSummary) => void;
    closeForm: () => void;
    openDetail: (monitor: MonitorSummary) => void;
    closeDetail: () => void;
    requestDelete: (monitor: MonitorSummary) => void;
    cancelDelete: () => void;

    submitMonitor: (input: MonitorInput) => Promise<boolean>;
    confirmDelete: (monitor: MonitorSummary) => Promise<void>;
    togglePause: (monitor: MonitorSummary) => Promise<void>;
    checkNow: (monitor: MonitorSummary) => Promise<void>;
}

export function useMonitorActions(refresh: () => Promise<void>): MonitorActions {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<MonitorSummary | null>(null);
    const [detailMonitorId, setDetailMonitorId] = useState<string | null>(null);
    const [monitorToDelete, setMonitorToDelete] = useState<MonitorSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [checkingId, setCheckingId] = useState<string | null>(null);

    const openCreate = useCallback(() => {
        setEditing(null);
        setFormOpen(true);
    }, []);

    const openEdit = useCallback((monitor: MonitorSummary) => {
        setEditing(monitor);
        setFormOpen(true);
    }, []);

    const closeForm = useCallback(() => {
        setFormOpen(false);
        setEditing(null);
    }, []);

    const openDetail = useCallback((monitor: MonitorSummary) => {
        setDetailMonitorId(monitor.id);
    }, []);

    const closeDetail = useCallback(() => setDetailMonitorId(null), []);
    const requestDelete = useCallback((monitor: MonitorSummary) => setMonitorToDelete(monitor), []);
    const cancelDelete = useCallback(() => setMonitorToDelete(null), []);

    /**
    * Throws on failure so `MonitorFormDialog` can surface the API's own message
    * inside the form, next to the fields that caused it.
    */
    const submitMonitor = useCallback(async (input: MonitorInput): Promise<boolean> => {
        const target = editing;
        const response = await fetch(
            target ? `/api/monitors/${target.id}` : '/api/monitors',
            {
                method: target ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            },
        );

        if (!response.ok) {
            throw new Error(await readError(
                response,
                target ? 'Failed to update monitor' : 'Failed to create monitor',
            ));
        }

        await refresh();
        toast.success(target ? 'Monitor updated' : 'Monitor created');
        setFormOpen(false);
        setEditing(null);
        return true;
    }, [editing, refresh]);

    const confirmDelete = useCallback(async (monitor: MonitorSummary) => {
        setDeleting(true);
        try {
            const response = await fetch(`/api/monitors/${monitor.id}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to delete monitor'));
            }
            await refresh();
            setMonitorToDelete(null);
            toast.success('Monitor deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete monitor');
        } finally {
            setDeleting(false);
        }
    }, [refresh]);

    const togglePause = useCallback(async (monitor: MonitorSummary) => {
        const paused = !monitor.paused;
        try {
            const response = await fetch(`/api/monitors/${monitor.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused }),
            });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to update monitor'));
            }
            await refresh();
            toast.success(paused ? 'Monitor paused' : 'Monitor resumed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update monitor');
        }
    }, [refresh]);

    /**
    * Brings the next check forward. Only a server holding that agent's socket
    * can dispatch a probe, so this returns once the monitor is marked due — the
    * result lands on a later poll, which is why the toast says "queued".
    */
    const checkNow = useCallback(async (monitor: MonitorSummary) => {
        setCheckingId(monitor.id);
        try {
            const response = await fetch(`/api/monitors/${monitor.id}/check`, { method: 'POST' });
            if (!response.ok) {
                throw new Error(await readError(response, 'Failed to queue check'));
            }
            await refresh();
            toast.success(`Check queued for ${monitor.name}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to queue check');
        } finally {
            setCheckingId(null);
        }
    }, [refresh]);

    return {
        formOpen,
        editing,
        detailMonitorId,
        monitorToDelete,
        deleting,
        checkingId,
        openCreate,
        openEdit,
        closeForm,
        openDetail,
        closeDetail,
        requestDelete,
        cancelDelete,
        submitMonitor,
        confirmDelete,
        togglePause,
        checkNow,
    };
}
