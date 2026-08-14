import { Terminal, Wifi, Activity } from 'lucide-react';

import { PhirepassLogo } from '@/components/PhirepassLogo';

import { AGENT_TERMINAL_LINES, TERMINAL_LINE_TONES } from '@/lib/marketing-demo';

/**
 * The marketing panel beside the login and signup forms.
 *
 * It lives in one place because it used to live in two: the copy drifted into
 * claims the product does not make (end-to-end encryption, a global edge
 * network) and a CLI command that does not exist, on both pages independently.
 * Anything shown here should be checkable against the agent or the server.
 */
const features = [
    {
        icon: Terminal,
        tone: 'bg-accent/10 border-accent/20 text-accent',
        title: 'SSH, SFTP, RDP & internal web apps',
        description:
            'A real terminal, a file browser, a Windows desktop, and the dashboards running on your machines — all in this browser tab',
    },
    {
        icon: Wifi,
        tone: 'bg-info/10 border-info/20 text-info',
        title: 'Outbound-only, no open ports',
        description:
            'The agent dials out and never listens. Works behind NAT, CG-NAT, or a locked-down firewall, with an Ed25519 identity and short-lived tokens',
    },
    {
        icon: Activity,
        tone: 'bg-violet/10 border-violet/20 text-violet',
        title: 'Uptime monitoring built in',
        description:
            'Internal and external checks with 30 days of history — including the private services a public monitor can never reach',
    },
];

export function AuthShowcase() {
    return (
        <>
            {/* Logo */}
            <div className="flex items-center gap-4 mb-8">
                <PhirepassLogo className="w-14 h-14 glow-primary rounded-xl" />
                <div>
                    <h1 className="text-3xl font-bold">
                        <span className="text-gradient">Phire</span>
                        <span className="text-foreground">pass</span>
                    </h1>
                    <p className="text-sm text-muted-foreground">Remote access &amp; uptime monitoring</p>
                </div>
            </div>

            {/* Same line the landing page opens and closes with. */}
            <p className="text-2xl font-medium mb-10 max-w-md">
                Reach it. Watch it. <span className="text-accent">Never expose it.</span>
            </p>

            {/* Terminal mockup — the real agent CLI, shared with the landing page. */}
            <div className="gradient-card border border-border rounded-xl p-1 mb-12 max-w-md" aria-hidden="true">
                <div className="bg-secondary/50 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <div className="w-3 h-3 rounded-full bg-destructive/60" />
                        <div className="w-3 h-3 rounded-full bg-warning/60" />
                        <div className="w-3 h-3 rounded-full bg-success/60" />
                        <span className="text-xs text-muted-foreground ml-2 font-mono">edge-01 — behind CG-NAT</span>
                    </div>
                    <div className="p-4 font-mono text-[13px] leading-6">
                        {AGENT_TERMINAL_LINES.map((line, index) => (
                            <div key={index} className="flex gap-2">
                                <span className={TERMINAL_LINE_TONES[line.tone]}>{line.mark}</span>
                                <span className={line.tone === 'prompt' ? 'text-foreground' : 'text-muted-foreground'}>
                                    {line.text}
                                </span>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <span className="text-accent">$</span>
                            <span className="w-2 h-[18px] bg-accent animate-terminal-blink" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Features */}
            <div className="space-y-6 max-w-md">
                {features.map((feature) => (
                    <div key={feature.title} className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${feature.tone}`}>
                            <feature.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
