'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Check,
    Copy,
    Download,
    Loader2,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import { mfaEnabledFromConfig } from '@/lib/mfa-feature';
import { cn } from '@/lib/utils';

/**
 * Two-factor authentication, in Settings.
 *
 * One rounded container with hairline-separated rows rather than a card per
 * control, because this is a single setting with a few consequences, not a list
 * of features. The state — on, off, how many recovery codes are left — is the
 * headline; the buttons are quiet until there is a reason to press one.
 *
 * Everything that changes the setting happens in a sheet, and every one of
 * those changes asks for a code. That is not the UI being cautious: the API
 * requires it, because a session that can silently remove the second factor is
 * not a second factor.
 */

type Status = {
    enabled: boolean;
    pending: boolean;
    enabled_at: string | null;
    last_used_at: string | null;
    recovery_codes_remaining: number;
};

type Enrollment = {
    secret_display: string;
    uri: string;
    qr: string;
};

/** Which sheet is open, and how far through it. */
type Step = null | 'scan' | 'confirm' | 'codes' | 'disable' | 'regenerate';

export function TwoFactorSection() {
    const { config, isLoading: configLoading } = useRuntimeConfig();
    const featureEnabled = mfaEnabledFromConfig(config);

    const [status, setStatus] = useState<Status | null>(null);
    const [loading, setLoading] = useState(true);

    const [step, setStep] = useState<Step>(null);
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const recoveryInputRef = useRef<HTMLInputElement>(null);

    // Guards the auto-submit of a full six digits against firing twice for the
    // same value across re-renders.
    const submittedRef = useRef<string | null>(null);

    const refresh = useCallback(async () => {
        if (!featureEnabled) {
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/auth/mfa', { cache: 'no-store' });
            if (!response.ok) throw new Error('unauthorized');
            setStatus(await response.json());
        } catch {
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, [featureEnabled]);

    // Wrapped rather than called straight: an effect that invokes a
    // state-setting callback directly reads to the lint rule as a synchronous
    // setState, which is the one thing this is not.
    useEffect(() => {
        const load = async () => {
            await refresh();
        };

        void load();
    }, [refresh]);

    const closeSheet = () => {
        setStep(null);
        setEnrollment(null);
        setRecoveryCodes(null);
        setCode('');
        setError(null);
        submittedRef.current = null;
    };

    const startEnrollment = async () => {
        setBusy(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/mfa/enroll', { method: 'POST' });
            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(body.error || 'Could not start enrolment.');
                return;
            }

            setEnrollment(body);
            setStep('scan');
        } catch {
            toast.error('Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    /** Posts a code to one of the three endpoints that want one. */
    const submitCode = useCallback(
        async (value: string, endpoint: string, onDone: (body: Record<string, unknown>) => void) => {
            if (busy) return;

            setBusy(true);
            setError(null);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: value }),
                });
                const body = await response.json().catch(() => ({}));

                if (!response.ok) {
                    setError(body.error || 'That code is not right.');
                    setCode('');
                    submittedRef.current = null;
                    return;
                }

                onDone(body);
            } catch {
                setError('Could not reach the server.');
                submittedRef.current = null;
            } finally {
                setBusy(false);
            }
        },
        [busy],
    );

    // The confirm step submits itself when the field fills; disabling and
    // regenerating do not, because both are destructive enough to deserve the
    // deliberate press of a button.
    useEffect(() => {
        if (step !== 'confirm' || code.length !== 6 || submittedRef.current === code) return;

        submittedRef.current = code;
        void submitCode(code, '/api/auth/mfa/activate', (body) => {
            setRecoveryCodes((body.recovery_codes as string[]) ?? []);
            setStep('codes');
            setCode('');
            void refresh();
        });
    }, [code, step, submitCode, refresh]);

    // Same caret-restoring reason as `CodeField`, for the field that takes
    // either kind of code.
    useEffect(() => {
        if (step === 'disable' && !busy && error) recoveryInputRef.current?.focus();
    }, [step, busy, error]);

    const confirmDisable = () =>
        submitCode(code, '/api/auth/mfa/disable', () => {
            toast.success('Two-factor authentication is off', {
                description: 'Signing in now needs only your GitHub account.',
            });
            closeSheet();
            void refresh();
        });

    const confirmRegenerate = () =>
        submitCode(code, '/api/auth/mfa/recovery-codes', (body) => {
            setRecoveryCodes((body.recovery_codes as string[]) ?? []);
            setStep('codes');
            setCode('');
            void refresh();
        });

    const copyCodes = async () => {
        if (!recoveryCodes) return;

        try {
            await navigator.clipboard.writeText(recoveryCodes.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy. Select the codes and copy them by hand.');
        }
    };

    const downloadCodes = () => {
        if (!recoveryCodes) return;

        const body = [
            'PhirePass recovery codes',
            'Each code works once. Keep this file somewhere your phone is not.',
            '',
            ...recoveryCodes,
            '',
        ].join('\n');

        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'phirepass-recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    };

    /**
     * Where the deployment has 2FA off, Settings simply does not mention it.
     *
     * After the hooks rather than before, because hooks cannot be conditional.
     * Nothing renders until the runtime config has arrived either — the section
     * appearing for a moment and then vanishing is worse than it arriving a
     * beat late, and this is the last card on a page that is already loading.
     */
    if (configLoading || !featureEnabled) return null;

    const enabled = Boolean(status?.enabled);
    const remaining = status?.recovery_codes_remaining ?? 0;
    const lowOnCodes = enabled && remaining > 0 && remaining <= 3;

    return (
        <>
            <section
                className={cn(
                    'mac-squircle overflow-hidden rounded-2xl border',
                    enabled ? 'border-hairline' : 'border-hairline',
                )}
                aria-label="Two-factor authentication"
            >
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <span
                            aria-hidden
                            className={cn(
                                'mac-squircle flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border',
                                enabled
                                    ? 'border-success/30 bg-success/12 text-success'
                                    : 'border-hairline bg-white/[0.06] text-muted-foreground',
                            )}
                        >
                            {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
                        </span>

                        <div className="min-w-0">
                            <h2 className="text-[15px] font-semibold text-foreground">
                                Two-factor authentication
                            </h2>
                            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                                {enabled
                                    ? 'Signing in asks for a six-digit code from your authenticator app as well as your GitHub account.'
                                    : 'Ask for a six-digit code from an authenticator app at sign-in, on top of GitHub. Works with 1Password, Aegis, Google Authenticator and anything else that scans a QR code.'}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 sm:pl-4">
                        {loading ? (
                            <div className="flex h-9 items-center text-[13px] text-muted-foreground">
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                Checking
                            </div>
                        ) : enabled ? (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setStep('disable');
                                    setCode('');
                                    setError(null);
                                }}
                            >
                                Turn off
                            </Button>
                        ) : (
                            <Button size="sm" onClick={startEnrollment} disabled={busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Turn on'}
                            </Button>
                        )}
                    </div>
                </div>

                {/* The recovery-code row only exists once there is something to
                    recover, so an account without 2FA sees one thing, not two. */}
                {enabled ? (
                    <div className="flex flex-col gap-4 border-t border-hairline p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground">Recovery codes</p>
                            <p
                                className={cn(
                                    'mt-1 text-[13px]',
                                    remaining === 0 || lowOnCodes ? 'text-warning' : 'text-muted-foreground',
                                )}
                            >
                                {remaining === 0
                                    ? 'None left. Generate a new set before you lose the phone.'
                                    : `${remaining} unused ${remaining === 1 ? 'code' : 'codes'}${
                                          lowOnCodes ? ' — worth generating a fresh set' : ''
                                      }.`}
                            </p>
                        </div>

                        <Button
                            variant="secondary"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                                setStep('regenerate');
                                setCode('');
                                setError(null);
                            }}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Generate new codes
                        </Button>
                    </div>
                ) : null}
            </section>

            <Dialog open={step !== null} onOpenChange={(open) => (open ? undefined : closeSheet())}>
                <DialogContent className="sm:max-w-[440px]">
                    {step === 'scan' && enrollment ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Scan this with your authenticator</DialogTitle>
                                <DialogDescription>
                                    Add an account in your authenticator app and point it at this code.
                                </DialogDescription>
                            </DialogHeader>

                            {/* On white, always. A QR is read by a camera pointed
                                at a screen, and a dark-mode inversion is the
                                classic way to produce one that will not scan. */}
                            <div className="flex justify-center py-2">
                                <div className="mac-squircle rounded-2xl bg-white p-3 shadow-control">
                                    <Image
                                        src={enrollment.qr}
                                        alt="QR code for enrolling an authenticator app"
                                        width={200}
                                        height={200}
                                        unoptimized
                                        className="h-[200px] w-[200px]"
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl border border-hairline bg-white/[0.03] p-4 text-center">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Or type it in
                                </p>
                                <p className="mt-2 select-all font-mono text-[13px] leading-relaxed tracking-wide text-foreground">
                                    {enrollment.secret_display}
                                </p>
                            </div>

                            <Button className="mt-2 h-11 w-full rounded-xl" onClick={() => setStep('confirm')}>
                                Next
                            </Button>
                        </>
                    ) : null}

                    {step === 'confirm' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Enter the code it shows</DialogTitle>
                                <DialogDescription>
                                    Six digits, from the PhirePass entry in your authenticator.
                                </DialogDescription>
                            </DialogHeader>

                            <CodeField
                                value={code}
                                onChange={setCode}
                                disabled={busy}
                                invalid={Boolean(error)}
                            />

                            <StatusLine busy={busy} error={error} />
                        </>
                    ) : null}

                    {step === 'codes' && recoveryCodes ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Save your recovery codes</DialogTitle>
                                <DialogDescription>
                                    These are shown once. Each works a single time, and they are the only
                                    way in if the phone is lost.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border border-hairline bg-white/[0.03] p-4">
                                {recoveryCodes.map((recoveryCode) => (
                                    <span
                                        key={recoveryCode}
                                        className="select-all text-center font-mono text-[13px] tracking-wide text-foreground"
                                    >
                                        {recoveryCode}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-1 grid grid-cols-2 gap-3">
                                <Button variant="secondary" className="gap-2" onClick={copyCodes}>
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                                <Button variant="secondary" className="gap-2" onClick={downloadCodes}>
                                    <Download className="h-4 w-4" />
                                    Download
                                </Button>
                            </div>

                            <Button className="mt-2 h-11 w-full rounded-xl" onClick={closeSheet}>
                                Done — I have saved them
                            </Button>
                        </>
                    ) : null}

                    {step === 'disable' || step === 'regenerate' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {step === 'disable'
                                        ? 'Turn off two-factor authentication'
                                        : 'Generate new recovery codes'}
                                </DialogTitle>
                                <DialogDescription>
                                    {step === 'disable'
                                        ? 'Enter a code from your authenticator, or one of your recovery codes. Sign-in will stop asking for a second step.'
                                        : 'Enter a code from your authenticator. The codes you have now stop working.'}
                                </DialogDescription>
                            </DialogHeader>

                            {step === 'disable' ? (
                                <input
                                    ref={recoveryInputRef}
                                    value={code}
                                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                                    placeholder="123456 or XXXXX-XXXXX"
                                    autoFocus
                                    spellCheck={false}
                                    autoComplete="one-time-code"
                                    disabled={busy}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && code.trim()) void confirmDisable();
                                    }}
                                    className={cn(
                                        'mac-squircle w-full rounded-xl border bg-white/[0.04] px-4 py-3',
                                        'text-center text-[16px] tracking-[0.1em] text-foreground',
                                        'placeholder:tracking-normal placeholder:text-muted-foreground/60',
                                        'transition-all focus:outline-none focus:ring-2 focus:ring-primary/50',
                                        error ? 'border-destructive/50' : 'border-hairline',
                                    )}
                                />
                            ) : (
                                <CodeField
                                    value={code}
                                    onChange={setCode}
                                    disabled={busy}
                                    invalid={Boolean(error)}
                                />
                            )}

                            <StatusLine busy={busy} error={error} />

                            <Button
                                variant={step === 'disable' ? 'destructive' : 'default'}
                                className="h-11 w-full rounded-xl"
                                disabled={busy || code.trim().length === 0}
                                onClick={() => (step === 'disable' ? confirmDisable() : confirmRegenerate())}
                            >
                                {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : step === 'disable' ? (
                                    'Turn it off'
                                ) : (
                                    'Generate new codes'
                                )}
                            </Button>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * The six-digit field, in the one shape it takes everywhere in this flow.
 *
 * It takes the caret back whenever a rejected code leaves it empty: the field
 * is disabled while the request is in flight, a disabled input drops focus, and
 * without this the retry has to start with a click.
 */
function CodeField({
    value,
    onChange,
    disabled,
    invalid,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    invalid: boolean;
}) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!disabled && invalid) ref.current?.focus();
    }, [disabled, invalid]);

    return (
        <div className="flex justify-center py-2">
            <InputOTP
                ref={ref}
                maxLength={6}
                value={value}
                onChange={onChange}
                disabled={disabled}
                autoFocus
                containerClassName="gap-2"
                aria-label="Six-digit code from your authenticator"
            >
                <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot
                            key={index}
                            index={index}
                            className={cn(
                                'mac-squircle h-12 w-11 rounded-xl border border-hairline bg-white/[0.04]',
                                'text-[19px] font-medium tabular-nums text-foreground',
                                'first:rounded-xl last:rounded-xl',
                                invalid ? 'border-destructive/50' : undefined,
                            )}
                        />
                    ))}
                </InputOTPGroup>
            </InputOTP>
        </div>
    );
}

/**
 * The one line under a code field, kept mounted so the dialog does not resize
 * the instant a wrong code comes back. `<Smartphone>` is the resting state: it
 * says where to look without shouting.
 */
function StatusLine({ busy, error }: { busy: boolean; error: string | null }) {
    return (
        <div className="flex min-h-[34px] items-center justify-center">
            {error ? (
                <p role="alert" className="text-center text-[13px] leading-snug text-destructive">
                    {error}
                </p>
            ) : busy ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking
                </p>
            ) : (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground/80">
                    <Smartphone className="h-3.5 w-3.5" />
                    The code changes every 30 seconds.
                </p>
            )}
        </div>
    );
}
