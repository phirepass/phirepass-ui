'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { cn } from '@/lib/utils';

/**
 * The second step of sign-in.
 *
 * Deliberately the narrowest screen in the product: one field, one sentence,
 * and the way out if the phone is gone. Someone arrives here mid-task with a
 * code that expires in seconds, so anything else on the page is in the way —
 * no header, no navigation, nothing to read.
 *
 * The six-digit field submits itself the moment it is full. A code is copied
 * from a phone screen one glance at a time; asking for a click afterwards is
 * how a code goes stale between typing it and sending it.
 */

type Mode = 'code' | 'recovery';

export function MfaChallenge() {
    const router = useRouter();

    const [mode, setMode] = useState<Mode>('code');
    const [code, setCode] = useState('');
    const [recovery, setRecovery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [expired, setExpired] = useState(false);
    const [busy, setBusy] = useState(false);

    const recoveryRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);

    // What was last sent, so the auto-submit does not fire twice for the same
    // six digits when React re-renders the field.
    const submittedRef = useRef<string | null>(null);

    const submit = useCallback(
        async (value: string) => {
            if (busy) return;

            setBusy(true);
            setError(null);

            try {
                const response = await fetch('/api/auth/mfa/challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: value }),
                });

                if (response.ok) {
                    const body = await response.json().catch(() => ({}));
                    // A full navigation, not a client push: the session cookie
                    // was just set, and every server component on the way to the
                    // dashboard has to be rendered with it.
                    window.location.href = body.redirect || '/dashboard/nodes';
                    return;
                }

                const body = await response.json().catch(() => ({}));

                if (response.status === 401) {
                    setExpired(true);
                    setError(body.error || 'This sign-in has expired.');
                    return;
                }

                setError(body.error || 'That code is not right.');
                setCode('');
                submittedRef.current = null;
            } catch {
                setError('Could not reach the server. Check your connection and try again.');
                submittedRef.current = null;
            } finally {
                setBusy(false);
            }
        },
        [busy],
    );

    useEffect(() => {
        if (mode !== 'code') return;
        if (code.length !== 6) return;
        if (submittedRef.current === code) return;

        submittedRef.current = code;
        void submit(code);
    }, [code, mode, submit]);

    useEffect(() => {
        if (mode === 'recovery') recoveryRef.current?.focus();
    }, [mode]);

    /**
     * Puts the caret back after a rejected code.
     *
     * The field is disabled while the request is in flight, and a disabled
     * input drops focus — so without this the code is cleared, the error is
     * shown, and typing the next attempt does nothing until you click. Keyed on
     * `busy` falling rather than on the error appearing, because that is the
     * moment the field can hold focus again.
     */
    useEffect(() => {
        if (mode === 'code' && !busy && error) codeRef.current?.focus();
    }, [busy, error, mode]);

    if (expired) {
        return (
            <Shell>
                <h1 className="text-[28px] font-semibold tracking-[-0.022em] text-foreground">
                    This sign-in expired
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    Codes are only asked for within a few minutes of signing in. Start again and
                    you will be back here in a moment.
                </p>
                <Button asChild className="mt-8 h-12 w-full rounded-xl text-[15px] font-semibold">
                    <Link href="/login">Back to sign in</Link>
                </Button>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1 className="text-[28px] font-semibold tracking-[-0.022em] text-foreground">
                Two-step verification
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {mode === 'code'
                    ? 'Open your authenticator app and enter the six-digit code for PhirePass.'
                    : 'Enter one of the recovery codes you saved when you turned this on. Each works once.'}
            </p>

            <div className="mt-8">
                {mode === 'code' ? (
                    <InputOTP
                        ref={codeRef}
                        maxLength={6}
                        value={code}
                        onChange={setCode}
                        disabled={busy}
                        autoFocus
                        containerClassName="justify-center gap-2.5"
                        aria-label="Six-digit verification code"
                    >
                        <InputOTPGroup className="gap-2.5">
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                <InputOTPSlot
                                    key={index}
                                    index={index}
                                    className={cn(
                                        // Each digit its own tile rather than the
                                        // default joined strip: a code is read off
                                        // a phone in pairs, and separated boxes are
                                        // what let the eye keep its place.
                                        'mac-squircle h-14 w-12 rounded-xl border border-hairline bg-white/[0.04]',
                                        'text-[22px] font-medium tabular-nums text-foreground',
                                        'first:rounded-xl last:rounded-xl',
                                        'transition-[border-color,box-shadow,background-color] duration-150',
                                        error ? 'border-destructive/50' : undefined,
                                    )}
                                />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (recovery.trim()) void submit(recovery.trim());
                        }}
                    >
                        <input
                            ref={recoveryRef}
                            value={recovery}
                            onChange={(event) => setRecovery(event.target.value.toUpperCase())}
                            placeholder="XXXXX-XXXXX"
                            autoComplete="one-time-code"
                            spellCheck={false}
                            disabled={busy}
                            className={cn(
                                'mac-squircle w-full rounded-xl border bg-white/[0.04] px-4 py-3.5',
                                'text-center text-[18px] font-medium tracking-[0.12em] text-foreground',
                                'placeholder:tracking-[0.12em] placeholder:text-muted-foreground/60',
                                'transition-all focus:outline-none focus:ring-2 focus:ring-primary/50',
                                error ? 'border-destructive/50' : 'border-hairline',
                            )}
                        />
                        <Button
                            type="submit"
                            disabled={busy || recovery.trim().length === 0}
                            className="mt-4 h-12 w-full rounded-xl text-[15px] font-semibold"
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
                        </Button>
                    </form>
                )}
            </div>

            {/* Held open whether or not there is an error, so the buttons below
                do not jump the moment a wrong code comes back. */}
            <div className="mt-4 min-h-[40px]">
                {error ? (
                    <p role="alert" className="text-center text-[13px] leading-snug text-destructive">
                        {error}
                    </p>
                ) : busy && mode === 'code' ? (
                    <p className="flex items-center justify-center gap-2 text-center text-[13px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Checking
                    </p>
                ) : null}
            </div>

            <div className="mt-2 flex flex-col items-center gap-3">
                <button
                    type="button"
                    onClick={() => {
                        setMode(mode === 'code' ? 'recovery' : 'code');
                        setError(null);
                        setCode('');
                        setRecovery('');
                        submittedRef.current = null;
                    }}
                    className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <KeyRound className="h-3.5 w-3.5" />
                    {mode === 'code' ? 'Use a recovery code' : 'Use my authenticator instead'}
                </button>

                <Link
                    href="/login"
                    className="text-[13px] text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                    Cancel and sign out
                </Link>
            </div>
        </Shell>
    );
}

/**
 * The card everything above sits in.
 *
 * One centred panel on an otherwise empty page — the sign-in screen's two-panel
 * layout is about persuading someone to come in, and by this point they are
 * already in.
 */
function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
            {/* The same faint bloom the sign-in page has, so the two screens
                read as one flow rather than two products. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
            />

            <div className="relative w-full max-w-[420px] animate-fade-in">
                <div className="mb-8 flex flex-col items-center">
                    <PhirepassLogo className="mb-5 h-14 w-14 rounded-2xl glow-primary" />
                    <span className="mac-squircle inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        Extra step
                    </span>
                </div>

                <div className="gradient-card mac-squircle rounded-2xl border border-hairline p-8 text-center">
                    {children}
                </div>
            </div>
        </div>
    );
}
