'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, Save } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { WebhookEndpoint } from '@/types/notification';

export interface WebhookFormValues {
    label: string;
    url: string;
    /** Only ever true from the edit form; creating always mints one. */
    rotate_secret: boolean;
}

interface WebhookFormDialogProps {
    open: boolean;
    /** Null while adding; the endpoint being edited otherwise. */
    endpoint: WebhookEndpoint | null;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (values: WebhookFormValues) => void;
}

/**
 * Add and edit in one dialog, because they ask for the same two fields.
 *
 * The third control only exists while editing: rotating is not a thing you can
 * do to an endpoint that does not exist yet, and a "rotate secret" switch on a
 * creation form would read as though there were an alternative.
 */
export function WebhookFormDialog({
    open,
    endpoint,
    submitting,
    onClose,
    onSubmit,
}: WebhookFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                {/*
                    Keyed on which endpoint is being edited, so the fields are
                    seeded by `useState` at mount rather than reset by an effect
                    afterwards. Radix unmounts the content when the dialog
                    closes, so the second endpoint you open never inherits the
                    first one's values.
                */}
                <WebhookForm
                    key={endpoint?.id ?? 'new'}
                    endpoint={endpoint}
                    submitting={submitting}
                    onClose={onClose}
                    onSubmit={onSubmit}
                />
            </DialogContent>
        </Dialog>
    );
}

function WebhookForm({
    endpoint,
    submitting,
    onClose,
    onSubmit,
}: Omit<WebhookFormDialogProps, 'open'>) {
    const editing = endpoint !== null;

    const [label, setLabel] = useState(endpoint?.name ?? '');
    const [url, setUrl] = useState(endpoint?.url ?? '');
    const [rotate, setRotate] = useState(false);

    const submit = () => {
        if (!url.trim()) return;
        onSubmit({ label: label.trim(), url: url.trim(), rotate_secret: rotate });
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>{editing ? 'Edit endpoint' : 'Add a webhook endpoint'}</DialogTitle>
                <DialogDescription>
                    {editing
                        ? 'Changing the URL clears this endpoint’s delivery history — the record belonged to the old address.'
                        : 'Every event you have switched on is POSTed here as signed JSON, alongside your registered browsers.'}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="webhook-url">Endpoint URL</Label>
                    <Input
                        id="webhook-url"
                        value={url}
                        placeholder="https://hooks.example.com/phirepass"
                        className="font-mono text-xs"
                        autoFocus={!editing}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Has to answer 2xx within ten seconds. Redirects are reported rather
                        than followed.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="webhook-label">Name</Label>
                    <Input
                        id="webhook-label"
                        value={label}
                        maxLength={120}
                        placeholder="Defaults to the host"
                        onChange={(event) => setLabel(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                </div>

                {editing ? (
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-hairline bg-white/[0.03] p-3">
                        <div className="min-w-0">
                            <Label htmlFor="webhook-rotate" className="cursor-pointer text-[13px]">
                                Rotate the signing secret
                            </Label>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                The current secret stops verifying the moment this is saved. The
                                new one is shown once — the receiver has to be updated with it.
                            </p>
                        </div>
                        <Switch
                            id="webhook-rotate"
                            checked={rotate}
                            onCheckedChange={setRotate}
                            aria-label="Rotate the signing secret"
                        />
                    </div>
                ) : null}
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className="gap-2" onClick={submit} disabled={submitting || !url.trim()}>
                    {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editing ? (
                        <Save className="h-4 w-4" />
                    ) : (
                        <Plus className="h-4 w-4" />
                    )}
                    {submitting ? 'Saving...' : editing ? 'Save' : 'Add endpoint'}
                </Button>
            </DialogFooter>
        </>
    );
}

interface WebhookSecretDialogProps {
    /** The secret, or null when there is nothing to reveal. */
    secret: string | null;
    /** The endpoint it belongs to, for the header line. */
    name: string | null;
    onClose: () => void;
}

/**
 * The one time the secret is readable.
 *
 * It is not recoverable afterwards — the list only ever returns the last four
 * characters — so this dialog is deliberately dismissible only by an explicit
 * click, and says plainly that closing it ends the only chance to copy it.
 */
export function WebhookSecretDialog({ secret, name, onClose }: WebhookSecretDialogProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    const copy = () => {
        if (!secret) return;
        void navigator.clipboard.writeText(secret);
        setCopied(true);
    };

    return (
        <Dialog open={secret !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-violet" />
                        Signing secret{name ? ` for ${name}` : ''}
                    </DialogTitle>
                    <DialogDescription>
                        Copy it now. It is not shown again, and it cannot be read back — rotating
                        is the only way to get a new one.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 rounded-xl border border-hairline bg-white/[0.03] p-3">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                        {secret}
                    </code>
                    <Button
                        variant="secondary"
                        size="icon"
                        className={cn('h-8 w-8 shrink-0', copied && 'text-success')}
                        aria-label="Copy the signing secret"
                        onClick={copy}
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>

                {/* How to actually use it, because a secret with no verification
                    recipe beside it tends to end up unverified. */}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p>Every delivery carries:</p>
                    <pre className="overflow-x-auto rounded-lg border border-hairline bg-black/20 p-3 font-mono text-[11px] leading-relaxed">
{`X-Phirepass-Timestamp: <unix seconds>
X-Phirepass-Signature: sha256=<hex>`}
                    </pre>
                    <p>
                        The signature is HMAC-SHA256 over <code className="font-mono">timestamp + &quot;.&quot; + body</code>,
                        keyed with this secret. Compare it in constant time, and reject a timestamp
                        that is too old to be a live delivery.
                    </p>
                </div>

                <DialogFooter>
                    <Button onClick={onClose}>I have copied it</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
