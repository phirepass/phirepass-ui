'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MonitorSummary } from '@/types/monitor';

import { MonitorDetailDialog } from './MonitorDetailDialog';
import { MonitorFormDialog } from './MonitorFormDialog';
import type { MonitorActions } from './use-monitor-actions';

interface MonitorDialogsProps {
    actions: MonitorActions;
    /**
    * The list the open detail dialog resolves its monitor from.
    *
    * Resolved by id on every render rather than captured when the dialog
    * opened, so a poll landing while it is open refreshes it in place instead
    * of freezing it at the values it was opened with.
    */
    monitors: MonitorSummary[];
}

/**
 * The three dialogs a monitor surface needs, in one place.
 *
 * The overview only ever opens the create form, but mounting all three there
 * costs nothing — each renders `null` until its own state says otherwise — and
 * it means a page cannot pick up an action without also picking up the dialog
 * that completes it.
 */
export function MonitorDialogs({ actions, monitors }: MonitorDialogsProps) {
    const detailMonitor = actions.detailMonitorId
        ? monitors.find((monitor) => monitor.id === actions.detailMonitorId) ?? null
        : null;

    return (
        <>
            {actions.formOpen ? (
                // Keyed so a cancelled edit cannot seed the next create; the
                // form reads its initial values from props exactly once.
                <MonitorFormDialog
                    key={actions.editing?.id ?? 'new'}
                    monitor={actions.editing}
                    onClose={actions.closeForm}
                    onSubmit={actions.submitMonitor}
                />
            ) : null}

            {detailMonitor ? (
                <MonitorDetailDialog
                    key={detailMonitor.id}
                    monitor={detailMonitor}
                    onClose={actions.closeDetail}
                    onCheckNow={actions.checkNow}
                />
            ) : null}

            <AlertDialog
                open={!!actions.monitorToDelete}
                onOpenChange={(open) => !open && actions.cancelDelete()}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete monitor</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete &ldquo;{actions.monitorToDelete?.name}&rdquo;? Its check history and incident
                            record are removed with it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actions.deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                // The dialog closes itself once the delete
                                // resolves; letting the default close it first
                                // would drop the pending state mid-request.
                                event.preventDefault();
                                if (actions.monitorToDelete) {
                                    void actions.confirmDelete(actions.monitorToDelete);
                                }
                            }}
                            disabled={actions.deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {actions.deleting ? 'Deleting...' : 'Delete monitor'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
