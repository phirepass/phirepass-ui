'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/rbac';
import type { InviteUserInput } from '@/types/user';

/** Owner is deliberately absent: ownership is transferred, not handed out with
 *  an invitation. */
const INVITABLE_ROLES: Role[] = ['admin', 'member'];

interface InviteUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Resolves true when the invitation was accepted by the caller. */
    onSubmit: (input: InviteUserInput) => Promise<boolean>;
    /** Addresses already in the workspace, rejected before submitting. */
    existingEmails: string[];
}

export function InviteUserDialog({ open, onOpenChange, onSubmit, existingEmails }: InviteUserDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                {/* The form's state lives one level down, in a component Radix
                    mounts only while the dialog is open. Reopening therefore
                    starts from a clean form without an effect resetting fields
                    behind the user's back. */}
                <InviteForm
                    onCancel={() => onOpenChange(false)}
                    onSubmit={onSubmit}
                    existingEmails={existingEmails}
                />
            </DialogContent>
        </Dialog>
    );
}

interface InviteFormProps {
    onCancel: () => void;
    onSubmit: (input: InviteUserInput) => Promise<boolean>;
    existingEmails: string[];
}

function InviteForm({ onCancel, onSubmit, existingEmails }: InviteFormProps) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Role>('member');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        const trimmed = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setError('Enter a valid email address.');
            return;
        }

        if (existingEmails.some((existing) => existing.toLowerCase() === trimmed)) {
            setError('That address is already in this workspace.');
            return;
        }

        setSubmitting(true);
        setError(null);
        const ok = await onSubmit({ email: trimmed, role });
        setSubmitting(false);

        if (!ok) {
            setError('Could not send the invitation.');
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Invite a user</DialogTitle>
                <DialogDescription>
                    They receive an email invitation and pick their own sign-in method.
                </DialogDescription>
            </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-email">Email address</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            autoComplete="off"
                            placeholder="person@example.com"
                            value={email}
                            onChange={(event) => { setEmail(event.target.value); setError(null); }}
                            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                            <SelectTrigger id="invite-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {INVITABLE_ROLES.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {ROLE_LABELS[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                    </div>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </div>

            <DialogFooter>
                <Button variant="ghost" onClick={onCancel} disabled={submitting}>
                    Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={submitting} className="gap-2">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Send invitation
                </Button>
            </DialogFooter>
        </>
    );
}
