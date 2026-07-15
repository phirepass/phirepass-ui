import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
    Terminal,
    Shield,
    Globe,
    Server,
    FolderSync,
    ArrowRight,
    CheckCircle2,
    Monitor,
    Building2,
    GraduationCap,
    Headphones,
    Lock,
    Cpu,
    Wifi,
    Network,
    KeyRound,
    Fingerprint,
    Home,
    Radio,
} from "lucide-react";

// Green stays the dominant brand color; info (blue) and warning (gold) are
// used sparingly on a minority of items so the palette doesn't read as flat.
const colorStyles = {
    accent: { bg: "bg-accent/20", text: "text-accent" },
    info: { bg: "bg-info/20", text: "text-info" },
    warning: { bg: "bg-warning/20", text: "text-warning" },
} as const;

const Landing = () => {
    const router = useRouter();

    const architectureSteps = [
        {
            icon: Monitor,
            title: "Browser",
            description: "Any device, any OS. Opens a WebSocket to the relay — no client software to install.",
        },
        {
            icon: Network,
            title: "Relay",
            description: "Authenticated proxy that looks up which node you're targeting and forwards framed traffic to it.",
        },
        {
            icon: Radio,
            title: "Agent",
            description: "A small binary on the target machine. Dials out only — never accepts an inbound connection.",
        },
        {
            icon: Lock,
            title: "Local service",
            description: "SSH, SFTP, or a local HTTP service (Grafana, an admin panel, an API) — never exposed publicly.",
        },
    ];

    const capabilities = [
        {
            icon: Terminal,
            color: "accent",
            title: "Full SSH terminal in the browser",
            description:
                "A real xterm.js terminal backed by a real SSH session — PTY allocation, window resize, paste, the works. The agent opens the SSH connection locally via a pure-Rust SSH implementation and streams it back over the relay.",
        },
        {
            icon: FolderSync,
            color: "info",
            title: "Visual SFTP file browser",
            description:
                "Browse, upload, and download files over the same tunnel. Transfers are chunked in both directions, so large files and slow links don't block the connection.",
        },
        {
            icon: Globe,
            color: "accent",
            title: "Reach internal HTTP services",
            description:
                "Open a dashboard, admin panel, or internal API running on a node directly in your browser — streamed through the relay, with no extra reverse proxy and no public DNS record pointing at it.",
        },
        {
            icon: Server,
            color: "accent",
            title: "One dashboard, every node",
            description:
                "See every connected node, its last-seen heartbeat, and its status in one place. Revoke a node's access instantly — it can't reconnect without re-enrolling.",
        },
    ] as const;

    const securityPoints = [
        {
            icon: Wifi,
            color: "accent",
            title: "Outbound-only, always",
            description: "The agent makes a single outbound WebSocket connection and holds it open. Nothing listens for inbound traffic on the machine it runs on.",
        },
        {
            icon: KeyRound,
            color: "warning",
            title: "One-time bootstrap token",
            description: "A scoped Personal Access Token registers the node exactly once. After that, the token is never used again.",
        },
        {
            icon: Fingerprint,
            color: "info",
            title: "Ed25519 node identity",
            description: "Each agent generates its own keypair on first run. The private key never leaves the device; the public key becomes its permanent identity.",
        },
        {
            icon: Shield,
            color: "accent",
            title: "Short-lived session tokens",
            description: "Every reconnect goes through a fresh challenge-sign-verify exchange and gets a JWT that expires in minutes, not days.",
        },
    ] as const;

    const targetMarkets = [
        {
            icon: Cpu,
            title: "DevOps & SRE teams",
            description: "Shell access to a server fleet without keeping port 22 open to the internet.",
        },
        {
            icon: Home,
            title: "Home labs & self-hosters",
            description: "Reach a Pi or NAS behind CG-NAT with no static IP, no port forwarding, no DDNS.",
        },
        {
            icon: Server,
            title: "MSPs & IT consultants",
            description: "Onboard a client machine without asking anyone to touch a firewall rule.",
        },
        {
            icon: GraduationCap,
            title: "Education & research labs",
            description: "Give students access to shared lab servers without handing out network changes.",
        },
        {
            icon: Headphones,
            title: "Support teams",
            description: "Jump onto a customer's or colleague's machine for a session, then walk away — nothing left listening.",
        },
    ];

    const features = [
        "Browser-based SSH terminal",
        "Visual SFTP file browser",
        "Browser access to internal HTTP services",
        "Outbound-only agent — works behind NAT/CG-NAT",
        "Ed25519 node identity + short-lived JWTs",
        "Home Assistant add-on available",
    ];

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.15),transparent_50%)]" />

            {/* Grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />

            <div className="relative z-10">
                {/* Hero Section */}
                <section className="flex flex-col items-center justify-center min-h-screen px-6 py-20">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/10 backdrop-blur-sm mb-8 animate-fade-in">
                        <Wifi className="w-4 h-4 text-accent" />
                        <span className="text-sm text-accent font-medium">
                            Outbound-Only Agent • No Open Ports
                        </span>
                    </div>

                    {/* Main title */}
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-center mb-6 animate-fade-in tracking-tight">
                        <span className="text-foreground">Phirepass</span>
                    </h1>

                    {/* Tagline */}
                    <p className="text-xl md:text-2xl lg:text-3xl text-center mb-6 animate-fade-in font-medium">
                        <span className="text-primary">
                            Access any machine securely, without opening a port.
                        </span>
                    </p>

                    {/* Subtitle */}
                    <p className="text-lg md:text-xl text-muted-foreground text-center max-w-3xl mb-4 animate-fade-in">
                        No VPN. No inbound firewall rules. No client software.
                    </p>

                    <p className="text-base text-muted-foreground text-center max-w-2xl mb-12 animate-fade-in leading-relaxed">
                        Install a lightweight agent on any machine — behind NAT, a
                        home router, or CG-NAT — and get a full SSH terminal, an SFTP
                        file browser, and browser access to its local HTTP services,
                        relayed securely to any web browser. The agent only ever
                        dials out.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-16 animate-fade-in">
                        <Button
                            variant="glow"
                            size="lg"
                            className="text-lg px-8 py-6 group"
                            onClick={() => router.push("/login")}
                        >
                            <Terminal className="w-5 h-5 mr-2" />
                            Get Started
                            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            className="text-lg px-8 py-6 border-border hover:border-accent/50 hover:bg-accent/5"
                            onClick={() =>
                                document
                                    .getElementById("how-it-works")
                                    ?.scrollIntoView({ behavior: "smooth" })
                            }
                        >
                            <Network className="w-5 h-5 mr-2" />
                            See How It Works
                        </Button>
                    </div>

                    {/* Quick features */}
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
                        {[
                            "Browser-Based",
                            "Zero-Install for Clients",
                            "Outbound-Only Agent",
                            "WebSocket-Powered",
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-accent" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* How it works */}
                <section id="how-it-works" className="px-6 py-24 max-w-8xl mx-auto scroll-mt-16">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            One outbound connection.{" "}
                            <span className="text-accent">Zero inbound ports.</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            The agent calls out to the relay and holds the connection
                            open. Your browser talks to the relay too — it matches the
                            two up and forwards traffic between them.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {architectureSteps.map((step, index) => (
                            <div key={step.title} className="relative flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
                                    <step.icon className="w-8 h-8 text-accent" />
                                </div>
                                <h3 className="font-bold text-lg text-foreground mb-2">{step.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                                {index < architectureSteps.length - 1 && (
                                    <ArrowRight className="hidden lg:block w-5 h-5 text-accent/50 absolute -right-3 top-6" />
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Dashboard screenshot */}
                <section id="dashboard-preview" className="px-6 py-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

                    <div className="max-w-6xl mx-auto relative">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">
                                Your whole fleet, <span className="text-accent">one dashboard</span>
                            </h2>
                            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                                Every node&apos;s CPU, memory, uptime, and connection status at a glance — with one-click console, file, and HTTP access
                            </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-2xl shadow-accent/5 overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
                                <div className="w-3 h-3 rounded-full bg-destructive/80" />
                                <div className="w-3 h-3 rounded-full bg-warning/80" />
                                <div className="w-3 h-3 rounded-full bg-success/80" />
                                <span className="ml-4 text-sm text-muted-foreground font-mono">phirepass — dashboard</span>
                            </div>

                            <Image
                                src="/dashboard-screenshot.png"
                                alt="Phirepass dashboard showing a fleet of connected nodes with live CPU, memory, and uptime stats"
                                width={2720}
                                height={2065}
                                className="w-full h-auto"
                                priority
                            />
                        </div>
                    </div>
                </section>

                {/* Core capabilities */}
                <section className="px-6 py-24 max-w-8xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Everything you need to{" "}
                            <span className="text-accent">reach a machine</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Terminal, files, and internal web services — all through the same secure tunnel
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {capabilities.map((cap, index) => (
                            <div
                                key={cap.title}
                                className="group p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-accent/50 transition-all duration-300"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className={`w-14 h-14 rounded-xl ${colorStyles[cap.color].bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                                    <cap.icon className={`w-7 h-7 ${colorStyles[cap.color].text}`} />
                                </div>
                                <h3 className="font-bold text-xl text-foreground mb-3">{cap.title}</h3>
                                <p className="text-muted-foreground leading-relaxed">{cap.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Security */}
                <section className="px-6 py-24 bg-secondary/20">
                    <div className="max-w-8xl mx-auto">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">
                                No static secrets. <span className="text-accent">Ever.</span>
                            </h2>
                            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                                Every credential in the system is short-lived, cryptographically bound to the node, and can be revoked instantly
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {securityPoints.map((point) => (
                                <div
                                    key={point.title}
                                    className="p-6 rounded-xl border border-border bg-card/30 hover:bg-card/50 hover:border-accent/30 transition-all"
                                >
                                    <point.icon className={`w-8 h-8 ${colorStyles[point.color].text} mb-4`} />
                                    <h3 className="font-semibold text-foreground mb-2">{point.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{point.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Target markets */}
                <section className="px-6 py-24 max-w-8xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Built for <span className="text-accent">Your Team</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Any team that manages private infrastructure and can't open inbound ports
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {targetMarkets.map((market) => (
                            <div
                                key={market.title}
                                className="p-6 rounded-xl border border-border bg-card/30 hover:bg-card/50 hover:border-accent/30 transition-all text-center"
                            >
                                <market.icon className="w-8 h-8 text-accent mx-auto mb-4" />
                                <h3 className="font-semibold text-foreground mb-2">{market.title}</h3>
                                <p className="text-xs text-muted-foreground">{market.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Feature summary */}
                <section className="px-6 py-24 bg-secondary/20">
                    <div className="max-w-8xl mx-auto">
                        <div className="grid md:grid-cols-2 gap-12 items-center">
                            <div>
                                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                                    Everything You Need,<br />
                                    <span className="text-accent">Nothing You Don't</span>
                                </h2>
                                <p className="text-muted-foreground text-lg mb-8">
                                    Phirepass is purpose-built for reaching private machines.
                                    No bloated features, no complex identity management —
                                    just fast, secure access to SSH, SFTP, and local HTTP services.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {features.map((feature) => (
                                        <div key={feature} className="flex items-center gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
                                            <span className="text-foreground text-sm">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { icon: Terminal, label: "SSH Terminal", desc: "Full xterm.js", color: "accent" },
                                    { icon: FolderSync, label: "SFTP Browser", desc: "Chunked transfer", color: "info" },
                                    { icon: Globe, label: "HTTP Proxy", desc: "Internal dashboards", color: "accent" },
                                    { icon: Building2, label: "Node Dashboard", desc: "One view, every node", color: "warning" },
                                ].map((item) => (
                                    <div key={item.label} className="aspect-square rounded-2xl border border-border bg-card/50 p-6 flex flex-col items-center justify-center gap-3 hover:border-accent/50 transition-colors">
                                        <item.icon className={`w-10 h-10 ${colorStyles[item.color as keyof typeof colorStyles].text}`} />
                                        <div className="text-center">
                                            <span className="text-sm font-medium block">{item.label}</span>
                                            <span className="text-xs text-muted-foreground">{item.desc}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="px-6 py-24">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-12 relative overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.1),transparent_60%)]" />

                            <div className="relative">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                    Ready to Simplify Server Access?
                                </h2>
                                <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                                    Install the agent, connect your node, and access it from any browser in minutes.
                                </p>

                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Button
                                        variant="glow"
                                        size="lg"
                                        className="text-lg px-10 py-6 group"
                                        onClick={() => router.push("/login")}
                                    >
                                        Get Started
                                        <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="text-lg px-10 py-6"
                                        onClick={() =>
                                            document
                                                .getElementById("how-it-works")
                                                ?.scrollIntoView({ behavior: "smooth" })
                                        }
                                    >
                                        See How It Works
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="px-6 py-12 border-t border-border">
                    <div className="max-w-8xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-accent" />
                            <span className="font-semibold">Phirepass</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            © 2026 Phirepass. Secure remote access without the
                            complexity.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="px-2 py-1 rounded bg-secondary">
                                WebSockets
                            </span>
                            <span className="px-2 py-1 rounded bg-secondary">
                                xterm.js
                            </span>
                            <span className="px-2 py-1 rounded bg-secondary">
                                Ed25519
                            </span>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default Landing;
