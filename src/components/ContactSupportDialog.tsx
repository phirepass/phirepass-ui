'use client';

import { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Loader2, Send } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LinkBadge } from '@/components/LinkBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS, type ContactTopic } from '@/types/contact';

/**
 * The support contact form.
 *
 * Reachable signed out as well as signed in — someone who cannot log in is
 * exactly the person who needs it — so the fields are asked for rather than
 * assumed, and prefilled from the session when there is one. The message is
 * delivered by `POST /api/contact`, which sends it through Resend; nothing is
 * written to the database.
 */

// Mirrors src/app/lib/contact-input.ts. The server re-checks all of it.
const LIMITS = { name: 120, email: 254, message: 5000 } as const;
const MIN_MESSAGE = 10;

export type ContactUser = {
    name?: string | null;
    email?: string | null;
};

type Fields = {
    name: string;
    email: string;
    topic: ContactTopic;
    message: string;
};

const EMPTY: Fields = {
    name: '',
    email: '',
    topic: 'general',
    message: '',
};

export function ContactSupportDialog({
    open,
    onOpenChange,
    user,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Prefills the identity fields when the sender is signed in. */
    user?: ContactUser | null;
}) {
    const [sending, setSending] = useState(false);

    return (
        <Dialog open={open} onOpenChange={(next) => (sending ? undefined : onOpenChange(next))}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LifeBuoy className="h-5 w-5 text-accent" />
                        Contact us
                    </DialogTitle>
                    <DialogDescription>
                        Tell us what you need and we&apos;ll get back to you by email.
                    </DialogDescription>
                </DialogHeader>

                {/* Mounted only while open, so every visit starts from the
                    initial state without an effect resetting the fields. */}
                {open ? (
                    <ContactForm
                        user={user}
                        sending={sending}
                        onSendingChange={setSending}
                        onSent={() => onOpenChange(false)}
                        onCancel={() => onOpenChange(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function ContactForm({
    user,
    sending,
    onSendingChange,
    onSent,
    onCancel,
}: {
    user?: ContactUser | null;
    sending: boolean;
    onSendingChange: (sending: boolean) => void;
    onSent: () => void;
    onCancel: () => void;
}) {
    const { toast } = useToast();
    const [fields, setFields] = useState<Fields>(() => ({
        ...EMPTY,
        name: user?.name ?? '',
        email: user?.email ?? '',
    }));
    // Honeypot: hidden from people and from screen readers, so anything in it
    // came from a bot filling every input on the page.
    const [company, setCompany] = useState('');
    const [error, setError] = useState<string | null>(null);
    // CSRF token, paired with an HttpOnly cookie the same response sets. Held in
    // a ref rather than state: nothing renders from it, and the submit handler
    // needs to read the value it just refreshed without waiting for a render.
    const csrfToken = useRef<string | null>(null);

    // This component mounts when the dialog opens, so the token is minted per
    // visit and no page carries a stale one around.
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const response = await fetch('/api/contact', { credentials: 'include' });
                if (!response.ok) return;
                const payload = await response.json() as { token?: string };
                if (!cancelled && payload.token) {
                    csrfToken.current = payload.token;
                }
            } catch {
                // Left null: the submit re-requests one before giving up.
            }
        };
        load();

        return () => { cancelled = true; };
    }, []);

    const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
        setFields((current) => ({ ...current, [key]: value }));

    const messageTooShort = fields.message.trim().length < MIN_MESSAGE;
    const canSend =
        fields.name.trim().length > 0
        && fields.email.trim().length > 0
        && !messageTooShort
        && !sending;

    /** Mints a token, replacing whatever the ref holds. */
    const refreshToken = async (): Promise<string | null> => {
        try {
            const response = await fetch('/api/contact', { credentials: 'include' });
            if (!response.ok) return null;
            const payload = await response.json() as { token?: string };
            csrfToken.current = payload.token ?? null;
        } catch {
            csrfToken.current = null;
        }

        return csrfToken.current;
    };

    const post = (token: string | null) =>
        fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ...fields, company, csrfToken: token }),
        });

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSend) return;

        onSendingChange(true);
        setError(null);

        try {
            let response = await post(csrfToken.current ?? (await refreshToken()));

            // A token that expired while the form sat open costs one retry
            // rather than a message the sender has to retype. Safe to repeat:
            // a 403 means nothing was sent.
            if (response.status === 403) {
                response = await post(await refreshToken());
            }

            const payload = await response.json().catch(() => null) as { error?: string } | null;

            if (!response.ok) {
                setError(payload?.error ?? 'Could not send your message. Please try again.');
                return;
            }

            toast({
                title: 'Message sent',
                description: "Thanks — we'll reply to " + fields.email.trim() + '.',
            });
            onSent();
        } catch {
            setError('Could not reach the server. Check your connection and try again.');
        } finally {
            onSendingChange(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot. `tabIndex={-1}` and `aria-hidden` keep it out of
                the keyboard order and off the accessibility tree. */}
            <input
                type="text"
                name="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="contact-name">Name</Label>
                    <Input
                        id="contact-name"
                        value={fields.name}
                        maxLength={LIMITS.name}
                        onChange={(e) => set('name', e.target.value)}
                        placeholder="Ada Lovelace"
                        autoComplete="name"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                        id="contact-email"
                        type="email"
                        value={fields.email}
                        maxLength={LIMITS.email}
                        onChange={(e) => set('email', e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="contact-topic">Topic</Label>
                <Select value={fields.topic} onValueChange={(value) => set('topic', value as ContactTopic)}>
                    <SelectTrigger id="contact-topic">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CONTACT_TOPICS.map((topic) => (
                            <SelectItem key={topic} value={topic}>
                                {CONTACT_TOPIC_LABELS[topic]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <Label htmlFor="contact-message">Message</Label>
                    <span
                        className={cn(
                            'text-xs tabular-nums text-muted-foreground',
                            fields.message.length > LIMITS.message - 200 && 'text-warning',
                        )}
                    >
                        {fields.message.length}/{LIMITS.message}
                    </span>
                </div>
                <Textarea
                    id="contact-message"
                    value={fields.message}
                    maxLength={LIMITS.message}
                    onChange={(e) => set('message', e.target.value)}
                    placeholder="What happened, what you expected, and anything you already tried."
                    className="min-h-[140px]"
                    required
                />
                <p className="text-xs text-muted-foreground">
                    Never include passwords, private keys, or PAT tokens.
                </p>
            </div>

            {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={sending}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={!canSend}>
                    {sending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-4 w-4" />
                            Send message
                        </>
                    )}
                </Button>
            </DialogFooter>
        </form>
    );
}

/**
 * The footer entry point: a link in the same badge style as the Terms and
 * Privacy links it sits beside, carrying its own dialog state so a server
 * component can drop it in without becoming a client component itself.
 */
export function ContactSupportLink({
    label = 'Contact',
    className,
    user,
}: {
    label?: string;
    className?: string;
    user?: ContactUser | null;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'group inline-flex items-center gap-2 align-middle transition-colors hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full',
                    className,
                )}
            >
                <LinkBadge icon={LifeBuoy} />
                {label}
            </button>
            <ContactSupportDialog open={open} onOpenChange={setOpen} user={user} />
        </>
    );
}
