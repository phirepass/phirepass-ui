'use client';

import { useRouter } from 'next/navigation';
import { Database, FlaskConical, KeyRound, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { useDemoModeSwitch } from '@/components/DemoModeProvider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DEMO_MONITOR_SPECS, DEMO_NODE_SPECS, DEMO_TOKEN_SPECS, DEMO_USER } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';

/**
 * Settings holds exactly one thing, and that is the point.
 *
 * The page it replaces offered email alerts, two-factor auth, a session
 * timeout and a dark-mode switch, none of which were wired to anything — a
 * settings page whose controls do nothing teaches people that this product's
 * settings do nothing. Everything here is real; the rest arrives when it works.
 *
 * Lives in `src/components/` rather than `src/pages/`, which is still an active
 * Pages Router root and would serve a second copy of this at `/Settings`.
 */
export default function SettingsPage() {
    const router = useRouter();
    const { enabled, setEnabled } = useDemoModeSwitch();

    const toggle = (next: boolean) => {
        setEnabled(next);

        toast[next ? 'info' : 'success'](
            next ? 'Demo data on' : 'Demo data off',
            {
                description: next
                    ? 'Nodes, monitors and tokens now come from a sample fleet. Nothing on your account is touched.'
                    : 'Back to your own nodes, monitors and tokens.',
            },
        );
    };

    const facts = [
        { label: 'Nodes', value: `${DEMO_NODE_SPECS.length} across ${new Set(DEMO_NODE_SPECS.map((node) => node.location.country)).size} countries` },
        { label: 'Monitors', value: `${DEMO_MONITOR_SPECS.length}, with 30 days of history` },
        { label: 'Tokens', value: `${DEMO_TOKEN_SPECS.length}, one of them expiring` },
        { label: 'Signed in as', value: DEMO_USER.username },
    ];

    return (
        <div className="container mx-auto space-y-6 px-4 py-6">
            <PageHeader
                title="Settings"
                description={enabled
                    // The header is naming the sample fleet's owner rather than
                    // the signed-in account, and saying otherwise here would be
                    // the page contradicting the thing above it.
                    ? 'Preferences for this browser. Demo data is on, so the identity in the header belongs to the sample fleet.'
                    : 'Preferences for this browser. Your name, email and avatar come from the account you signed in with.'}
            />

            <section
                className={cn(
                    'gradient-card mac-squircle relative overflow-hidden rounded-2xl border',
                    enabled ? 'border-accent/30' : 'border-hairline'
                )}
                aria-label="Demo data"
            >
                {/* Lit only while it is on, so the state reads from across a room
                    — which is where the person watching a demo is sitting. */}
                {enabled ? <div aria-hidden className="pp-bloom pointer-events-none absolute inset-0" /> : null}

                <div className="relative flex flex-col gap-8 p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center lg:gap-10">
                    <div className="flex min-w-0 items-start gap-4">
                        <span
                            aria-hidden
                            className={cn(
                                'mac-squircle flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border',
                                enabled
                                    ? 'border-accent/30 bg-accent/12 text-accent shadow-[0_0_30px_hsl(var(--accent)/0.32)]'
                                    : 'border-hairline bg-white/[0.06] text-muted-foreground'
                            )}
                        >
                            {enabled ? <FlaskConical className="h-7 w-7" /> : <Database className="h-7 w-7" />}
                        </span>

                        <div className="min-w-0">
                            <h2 className="text-xl font-semibold tracking-[-0.022em] text-foreground">
                                {enabled ? 'Showing sample data' : 'Demo data'}
                            </h2>
                            <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
                                {enabled
                                    ? 'The dashboard is drawing a sample fleet instead of your account, under a sample name. Nothing you do to it — renaming a node, adding a monitor, revoking a token — reaches your real data, and none of it is saved.'
                                    : 'Fills the dashboard with a sample fleet of nodes and uptime monitors, under a sample name, for demos, walkthroughs and screenshots of an account that is not empty. It runs entirely in this browser: your own nodes and monitors are never read or changed.'}
                            </p>

                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={toggle}
                                    aria-label="Show demo data instead of this account's own"
                                />
                                <span className="text-[13px] font-medium text-foreground">
                                    {enabled ? 'On for this tab' : 'Off'}
                                </span>

                                {enabled ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => router.push('/dashboard/nodes')}
                                    >
                                        View the sample fleet
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>

                            <p className="mt-4 text-[12px] text-muted-foreground/80">
                                Not remembered: reloading the page, or opening another tab, is back on your own data.
                                Live sessions — terminal, files, screen, tunnels — need a real agent, so they stay
                                unavailable while this is on.
                            </p>
                        </div>
                    </div>

                    {/* What is actually in the fixture, counted from it rather
                        than described, so this cannot drift from the fleet. */}
                    <div className="w-full min-w-0 rounded-xl border border-hairline bg-white/[0.03] p-4">
                        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            What you get
                        </p>
                        <dl className="space-y-2.5">
                            {facts.map((fact) => (
                                <div key={fact.label} className="flex items-baseline justify-between gap-4">
                                    <dt className="text-[13px] text-muted-foreground">{fact.label}</dt>
                                    <dd className="text-right text-[13px] font-medium text-foreground">{fact.value}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-3 text-[12px] text-muted-foreground/80">
                            Every status the dashboard can draw is represented: one node offline, one monitor down,
                            one slow, one certificate about to expire.
                        </p>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-hairline p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                            Access tokens
                        </h2>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                            Tokens are what enrol an agent on a machine. They have their own page.
                        </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard/pat-tokens')}>
                        Manage tokens
                    </Button>
                </div>
            </section>
        </div>
    );
}
