import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import Image from "next/image";
import Link from "next/link";
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
    Activity,
    MapPin,
    History,
    MonitorPlay,
} from "lucide-react";
import {
    AGENT_TERMINAL_LINES,
    SSH_SESSION_LINES,
    SAMPLE_UPTIME_MONTH,
    SAMPLE_UPTIME_TONES,
    TERMINAL_LINE_TONES,
} from "@/lib/marketing-demo";
import { PhirepassLogo } from "@/components/PhirepassLogo";
import { LegalLinks } from "@/components/LegalLinks";

/** One shell for every section, matching the dashboard's own container. */
const SECTION_SHELL = "container mx-auto px-4";

/** A grouped panel: one rounded container whose cells are split by 1px
 *  hairlines (the gap shows the panel's fill through), instead of a grid of
 *  separately bordered cards. Cells need an opaque fill for the lines to read. */
const GROUP_PANEL = "grid grid-cols-1 gap-px rounded-2xl border border-hairline bg-hairline overflow-hidden";
const GROUP_CELL = "bg-card p-6 sm:p-8";
/** One restrained icon treatment for the whole page — the brand colour only. */
const ICON_CHIP = "w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center mb-5";

const productShots = [
    {
        src: "/listing.png",
        alt: "Phirepass dashboard showing a fleet of connected nodes with live CPU, memory, and uptime stats",
        title: "Your whole fleet, one dashboard",
        description: "Every node's CPU, memory, uptime, and connection status at a glance.",
        width: 2722,
        height: 2067,
    },
    {
        src: "/terminal.png",
        alt: "Full SSH terminal session running htop, streamed live in the browser",
        title: "A real terminal, in the browser",
        description: "Full xterm.js terminal backed by a real SSH session — PTY, resize, paste, the works.",
        width: 2722,
        height: 2067,
    },
    {
        src: "/sftp.png",
        alt: "Visual SFTP file browser showing a remote directory listing",
        title: "Visual SFTP file browser",
        description: "Browse, upload, and download files over the same tunnel — no separate client.",
        width: 2722,
        height: 2067,
    },
] as const;

const Landing = () => {
    const router = useRouter();
    const [carouselApi, setCarouselApi] = useState<CarouselApi>();

    const subscribeToSlideChange = useCallback(
        (onStoreChange: () => void) => {
            if (!carouselApi) return () => {};
            carouselApi.on("select", onStoreChange);
            return () => carouselApi.off("select", onStoreChange);
        },
        [carouselApi],
    );
    const getActiveSlideSnapshot = useCallback(
        () => carouselApi?.selectedScrollSnap() ?? 0,
        [carouselApi],
    );
    const activeSlide = useSyncExternalStore(subscribeToSlideChange, getActiveSlideSnapshot, () => 0);

    useEffect(() => {
        if (!carouselApi) return;

        const interval = setInterval(() => {
            carouselApi.scrollNext();
        }, 4500);

        return () => clearInterval(interval);
    }, [carouselApi]);

    const accessKinds = [
        { icon: Terminal, label: "SSH", detail: "Terminal in the browser" },
        { icon: FolderSync, label: "SFTP", detail: "File browser" },
        { icon: MonitorPlay, label: "RDP", detail: "Remote desktop" },
        { icon: Globe, label: "HTTP", detail: "Internal web apps" },
    ];

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
            description: "SSH, SFTP, RDP, or a local HTTP service (Grafana, an admin panel, an API) — never exposed publicly.",
        },
    ];

    const capabilities = [
        {
            icon: Terminal,
            title: "SSH terminal",
            description:
                "A real xterm.js terminal on a real SSH session — PTY, resize, paste. The agent opens it locally and streams it over the relay.",
        },
        {
            icon: FolderSync,
            title: "SFTP file browser",
            description:
                "Browse, upload, and download over the same tunnel. Chunked both ways, so big files and slow links don't stall it.",
        },
        {
            icon: Globe,
            title: "Internal web services",
            description:
                "Open a dashboard, admin panel, or internal API on a node in your browser — no reverse proxy, no public DNS record.",
        },
        {
            icon: MonitorPlay,
            title: "Remote desktop",
            description:
                "Reach a Windows machine's desktop over RDP, rendered in the browser. Nothing to install on the viewing side.",
        },
        {
            icon: Server,
            title: "Every node, one view",
            description:
                "Each node's heartbeat, status, CPU, and memory in one place. Revoke a node and it can't reconnect without re-enrolling.",
        },
        {
            icon: Home,
            title: "Home Assistant add-on",
            description:
                "Running Home Assistant? Install the agent as an add-on and reach that box like any other node.",
        },
    ];

    // Monitoring gets its own section rather than a fifth capability card: the
    // others answer "reach the machine", this one answers "is it healthy".
    const monitoringPoints = [
        {
            icon: MapPin,
            title: "Pick where the check runs from",
            description:
                "External, from our server fleet, for anything with a public address. Internal, on an agent you already installed, for everything else — nothing has to be published to be watched, and there is nothing extra to deploy. Same monitor, same history, either way.",
        },
        {
            icon: Activity,
            title: "Checks that know the difference",
            description:
                "Every check tests the status code, an optional keyword in the response body, and how long the answer took. A slow but correct response is marked degraded, not down — so a red monitor still means something at 3am.",
        },
        {
            icon: History,
            title: "Thirty days of honest history",
            description:
                "Uptime across 24 hours, 7 days, and 30 days, a daily bar strip, average latency, and a timeline of every incident. Checks that reached no verdict are shown as gaps and left out of the percentage — never quietly counted as uptime.",
        },
    ];

    const monitoringFacts = [
        "Internal & external targets",
        "Runs on your own agent",
        "HTTP & HTTPS",
        "Every 15 minutes to once a day",
        "Keyword match",
        "Custom status codes",
        "Latency thresholds",
        "Incident log",
    ];

    const securityPoints = [
        {
            icon: Wifi,
            title: "Outbound-only, always",
            description: "The agent makes a single outbound WebSocket connection and holds it open. Nothing listens for inbound traffic on the machine it runs on.",
        },
        {
            icon: KeyRound,
            title: "One-time bootstrap token",
            description: "A scoped Personal Access Token registers the node exactly once. After that, the token is never used again.",
        },
        {
            icon: Fingerprint,
            title: "Ed25519 node identity",
            description: "Each agent generates its own keypair on first run. The private key never leaves the device; the public key becomes its permanent identity.",
        },
        {
            icon: Shield,
            title: "Short-lived session tokens",
            description: "Every reconnect goes through a fresh challenge-sign-verify exchange and gets a JWT that expires in minutes, not days.",
        },
    ];

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

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.15),transparent_50%)]" />

            {/* Grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />

            <div className="relative z-10">
                {/* Hero Section */}
                <section className="min-h-screen flex items-center py-20">
                    <div className={`w-full ${SECTION_SHELL} grid lg:grid-cols-2 gap-12 lg:gap-8 items-center`}>
                        {/* Copy */}
                        <div className="flex flex-col items-center lg:items-start text-center lg:text-left animate-fade-in lg:max-w-xl lg:justify-self-end">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/10 backdrop-blur-sm mb-8">
                                <Wifi className="w-4 h-4 text-accent shrink-0" />
                                {/* Kept to one line: wrapped, the pill turns lumpy and the
                                    icon floats between lines. Phones drop the last clause —
                                    the copy below already says it. */}
                                <span className="text-sm text-accent font-medium whitespace-nowrap">
                                    Remote Access + Uptime Monitoring
                                    <span className="hidden sm:inline"> • No Open Ports</span>
                                </span>
                            </div>

                            <h1 className="flex items-center gap-4 md:gap-5 text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
                                <PhirepassLogo className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 shrink-0" />
                                <span className="text-foreground">Phirepass</span>
                            </h1>

                            <p className="text-xl md:text-2xl lg:text-3xl font-medium text-primary mb-6">
                                Reach it. Watch it.{" "}
                                <span className="text-accent">Never expose it.</span>
                            </p>

                            {/* The punchline above is for memory; this line is for
                                meaning — and it is the sentence the title and meta
                                description are built from, so it stays. */}
                            <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
                                Access and monitor any machine securely, without opening a
                                port. One agent, dialling out — no VPN, no inbound firewall
                                rules, nothing for your users to install.
                            </p>

                            {/* CTA Buttons */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <Button
                                    variant="glow"
                                    size="lg"
                                    className="h-12 px-7 text-base group"
                                    onClick={() => router.push("/login")}
                                >
                                    <Terminal className="w-5 h-5 mr-2" />
                                    Get started
                                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="h-12 px-7 text-base border-hairline hover:border-accent/50 hover:bg-accent/5"
                                    onClick={() =>
                                        document
                                            .getElementById("how-it-works")
                                            ?.scrollIntoView({ behavior: "smooth" })
                                    }
                                >
                                    <Network className="w-5 h-5 mr-2" />
                                    See how it works
                                </Button>
                            </div>

                            {/* The four ways in, named once and up front — the
                                paragraph above says "access", this says what kind. */}
                            <ul className="mt-8 flex flex-wrap justify-center lg:justify-start gap-2" aria-label="Supported connections">
                                {accessKinds.map((kind) => (
                                    <li
                                        key={kind.label}
                                        className="flex items-center gap-2 rounded-full border border-hairline bg-card/60 px-3 py-1.5 text-sm"
                                    >
                                        <kind.icon className="w-4 h-4 text-accent" />
                                        <span className="font-medium text-foreground" title={kind.detail}>{kind.label}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Illustration: a session and a monitor, side by side, drawn from
                            the same tokens the product uses. Decorative — the copy beside
                            it says the same thing in words. */}
                        {/* Below lg the three cards are a plain vertical stack: the
                            overlap and the tilts only exist where there is room for
                            them, so nothing lands on top of anything on a phone. */}
                        <div
                            className="relative flex flex-col gap-5 lg:block animate-fade-in lg:w-full lg:max-w-xl lg:justify-self-start"
                            aria-hidden="true"
                        >
                            <div className="rounded-2xl border border-hairline bg-card/90 backdrop-blur-sm shadow-2xl shadow-accent/10 overflow-hidden lg:rotate-1 hover:rotate-0 transition-transform duration-500">
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-secondary/40">
                                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                                    <span className="w-3 h-3 rounded-full bg-warning/60" />
                                    <span className="w-3 h-3 rounded-full bg-success/60" />
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                        edge-01 — behind CG-NAT
                                    </span>
                                </div>

                                <div className="p-4 sm:p-5 font-mono text-[11px] sm:text-[13px] leading-5 sm:leading-6 whitespace-nowrap overflow-x-auto scrollbar-hide">
                                    {AGENT_TERMINAL_LINES.map((line, index) => (
                                        <div key={index} className="flex gap-2">
                                            <span className={TERMINAL_LINE_TONES[line.tone]}>{line.mark}</span>
                                            <span
                                                className={
                                                    line.tone === "prompt"
                                                        ? "text-foreground"
                                                        : "text-muted-foreground"
                                                }
                                            >
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

                            {/* A live SSH session over the top corner: the agent below
                                connects, this is what you get for it. */}
                            <div className="w-full lg:absolute lg:-top-14 lg:-right-4 lg:w-72 rounded-xl border border-hairline bg-card shadow-2xl shadow-accent/10 overflow-hidden lg:-rotate-2 hover:rotate-0 transition-transform duration-500">
                                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline bg-secondary/50">
                                    <span className="w-2 h-2 rounded-full bg-destructive/60" />
                                    <span className="w-2 h-2 rounded-full bg-warning/60" />
                                    <span className="w-2 h-2 rounded-full bg-success/60" />
                                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">ssh · edge-01</span>
                                </div>
                                {/* whitespace-pre: top's columns are aligned with spaces
                                    and HTML would otherwise collapse them. */}
                                <div className="p-3 font-mono text-[10px] leading-4 whitespace-pre overflow-x-auto scrollbar-hide">
                                    {SSH_SESSION_LINES.map((line, index) => (
                                        <div key={index} className="flex gap-1.5">
                                            <span className={TERMINAL_LINE_TONES[line.tone]}>{line.mark}</span>
                                            <span
                                                className={
                                                    line.tone === "prompt"
                                                        ? "text-foreground"
                                                        : TERMINAL_LINE_TONES[line.tone]
                                                }
                                            >
                                                {line.text}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* A monitor card riding along the corner: the second half of
                                the product, visible without another paragraph about it. */}
                            <div className="w-full lg:absolute lg:-bottom-8 lg:-left-8 lg:w-64 rounded-xl border border-hairline bg-card shadow-2xl shadow-accent/10 p-4 lg:-rotate-2 hover:rotate-0 transition-transform duration-500">
                                <div className="flex items-center gap-2 mb-3">
                                    <Globe className="w-4 h-4 text-accent shrink-0" />
                                    <span className="text-xs font-medium truncate">Internal API</span>
                                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                                        <span className="w-2 h-2 rounded-full bg-success text-success animate-pulse-glow" />
                                        <span className="text-xs font-medium text-success">Up</span>
                                    </span>
                                </div>
                                <div className="flex items-end gap-[2px] mb-2">
                                    {SAMPLE_UPTIME_MONTH.slice(-18).map((tone, index) => (
                                        <div
                                            key={index}
                                            className={`h-5 min-w-[3px] flex-1 rounded-[2px] ${SAMPLE_UPTIME_TONES[tone]}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                                    <span>142 ms</span>
                                    <span>99.94% · 30d</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* How it works */}
                <section id="how-it-works" className={`${SECTION_SHELL} py-24 scroll-mt-16`}>
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

                    {/* A rail rather than four floating icons: the path is the point,
                        so the steps sit on one line that the traffic travels along. */}
                    <ol className="relative grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-8 max-w-6xl mx-auto">
                        <div
                            aria-hidden="true"
                            className="hidden lg:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-hairline via-accent/50 to-hairline"
                        />
                        {architectureSteps.map((step, index) => (
                            <li key={step.title} className="relative flex lg:flex-col items-start lg:items-center gap-5 lg:gap-0 lg:text-center">
                                <div className="relative w-12 h-12 rounded-full border border-hairline-strong bg-card flex items-center justify-center shrink-0 lg:mb-5">
                                    <step.icon className="w-5 h-5 text-accent" />
                                </div>
                                <div>
                                    <p className="font-mono text-xs text-muted-foreground mb-1">
                                        {String(index + 1).padStart(2, "0")}
                                    </p>
                                    <h3 className="font-semibold text-lg text-foreground mb-2">{step.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed lg:max-w-60 lg:mx-auto">
                                        {step.description}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* Product carousel */}
                <section id="dashboard-preview" className="py-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

                    <div className={`${SECTION_SHELL} relative`}>
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">
                                See it <span className="text-accent">in action</span>
                            </h2>
                            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                                One dashboard for every node, with a terminal, a file browser and a remote desktop one click away.
                            </p>
                        </div>

                        <Carousel setApi={setCarouselApi} opts={{ loop: true }} className="group">
                            <CarouselContent>
                                {productShots.map((shot, index) => (
                                    <CarouselItem key={shot.src}>
                                        <div className="rounded-2xl border border-hairline bg-card/80 backdrop-blur-sm shadow-2xl shadow-accent/5 overflow-hidden">
                                            {/* Only the first slide preloads. `priority` on
                                                all three preloaded ~2.9MB of PNG for a
                                                section below the fold, competing with the
                                                hero for the LCP. `sizes` stops phones
                                                being served the 3840px variant. */}
                                            <Image
                                                src={shot.src}
                                                alt={shot.alt}
                                                width={shot.width}
                                                height={shot.height}
                                                className="w-full h-auto"
                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1152px"
                                                priority={index === 0}
                                                loading={index === 0 ? undefined : "lazy"}
                                            />
                                        </div>
                                        <div className="text-center mt-6">
                                            <h3 className="font-bold text-xl text-foreground mb-1">{shot.title}</h3>
                                            <p className="text-muted-foreground">{shot.description}</p>
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="opacity-100 mouse:opacity-0 mouse:group-hover:opacity-100 transition-opacity -left-4 lg:-left-12" />
                            <CarouselNext className="opacity-100 mouse:opacity-0 mouse:group-hover:opacity-100 transition-opacity -right-4 lg:-right-12" />
                        </Carousel>

                        <div className="flex items-center justify-center gap-2 mt-6">
                            {productShots.map((shot, index) => (
                                <button
                                    key={shot.src}
                                    type="button"
                                    aria-label={`Show ${shot.title}`}
                                    onClick={() => carouselApi?.scrollTo(index)}
                                    className={`h-2 rounded-full transition-all ${
                                        index === activeSlide ? "w-6 bg-accent" : "w-2 bg-border hover:bg-accent/50"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* Core capabilities */}
                <section className={`${SECTION_SHELL} py-24`}>
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Everything you need to{" "}
                            <span className="text-accent">reach a machine</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Terminal, files, desktops, and internal web services — all through the same tunnel
                        </p>
                    </div>

                    <div className={`${GROUP_PANEL} sm:grid-cols-2 lg:grid-cols-3`}>
                        {capabilities.map((cap) => (
                            <div key={cap.title} className={GROUP_CELL}>
                                <div className={ICON_CHIP}>
                                    <cap.icon className="w-5 h-5 text-accent" />
                                </div>
                                <h3 className="font-semibold text-lg text-foreground mb-2">{cap.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Uptime monitoring */}
                <section id="monitoring" className={`${SECTION_SHELL} py-24 scroll-mt-16`}>
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/30 bg-accent/10 backdrop-blur-sm mb-6">
                            <Activity className="w-4 h-4 text-accent" />
                            <span className="text-sm text-accent font-medium">New</span>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Uptime monitoring,{" "}
                            <span className="text-accent">internal and external</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                            External checks run from our servers and see your public URL the way
                            the internet does. Internal checks run on your own agent, inside the
                            network — on the private API, the admin panel bound to localhost, the
                            health endpoint behind the firewall. Plenty of services do the first
                            one well. The second is the one they can&apos;t reach at all.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                        {/* Illustration: a monitor card built from the same tokens the
                            real dashboard uses, so it can't drift out of theme. Sample
                            data, so it is hidden from screen readers — the points
                            beside it carry the same meaning in words. */}
                        <div>
                            <div
                                aria-hidden="true"
                                className="rounded-2xl border border-hairline bg-card/80 backdrop-blur-sm shadow-2xl shadow-accent/5 p-6"
                            >
                                <div className="flex items-start gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                                        <Globe className="w-5 h-5 text-accent" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-foreground truncate">Internal API</p>
                                        <p className="text-xs text-muted-foreground font-mono truncate">
                                            http://10.0.4.12:8080/health
                                        </p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2 shrink-0">
                                        <span className="px-2 py-1 rounded-full border border-hairline bg-secondary/60 text-[11px] text-muted-foreground">
                                            Internal
                                        </span>
                                        <span className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-success/35 bg-success/10">
                                            <span className="w-2 h-2 rounded-full bg-success" />
                                            <span className="text-xs font-medium text-success">Up</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="text-muted-foreground">Latency</span>
                                        <span className="font-mono font-medium text-success">142 ms</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                        <div className="h-full w-[28%] rounded-full bg-success" />
                                    </div>
                                </div>

                                <div className="mb-2 flex items-end gap-[2px]">
                                    {SAMPLE_UPTIME_MONTH.map((tone, index) => (
                                        <div
                                            key={index}
                                            className={`h-8 min-w-[3px] flex-1 rounded-[2px] ${SAMPLE_UPTIME_TONES[tone]}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-6">
                                    <span>30 days ago</span>
                                    <span>Today</span>
                                </div>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t border-hairline pt-4">
                                    {[
                                        ["Checked", "2m ago"],
                                        ["Every", "15 minutes"],
                                        ["30d uptime", "99.94%"],
                                        ["Runs on", "agent edge-01"],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex items-center gap-2">
                                            <span className="text-muted-foreground">{label}</span>
                                            <span className="ml-auto font-mono text-foreground">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <p className="text-center text-xs text-muted-foreground mt-4">
                                An example monitor: one card per service, 30 days at a glance
                            </p>
                        </div>

                        <div className="flex flex-col gap-8">
                            {monitoringPoints.map((point) => (
                                <div key={point.title} className="flex gap-5">
                                    <div className="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center shrink-0">
                                        <point.icon className="w-5 h-5 text-accent" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-foreground mb-2">{point.title}</h3>
                                        <p className="text-muted-foreground leading-relaxed">{point.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 mt-10">
                        {monitoringFacts.map((fact) => (
                            <span
                                key={fact}
                                className="px-3 py-1.5 rounded-full border border-hairline bg-card/30 text-xs text-muted-foreground"
                            >
                                {fact}
                            </span>
                        ))}
                    </div>
                </section>

                {/* Security */}
                <section className="py-24 bg-secondary/20">
                    <div className={SECTION_SHELL}>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold mb-4">
                                No static secrets. <span className="text-accent">Ever.</span>
                            </h2>
                            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                                Every credential in the system is short-lived, cryptographically bound to the node, and can be revoked instantly
                            </p>
                        </div>

                        <div className={`${GROUP_PANEL} sm:grid-cols-2 lg:grid-cols-4`}>
                            {securityPoints.map((point) => (
                                <div key={point.title} className={GROUP_CELL}>
                                    <div className={ICON_CHIP}>
                                        <point.icon className="w-5 h-5 text-accent" />
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-2">{point.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{point.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Target markets */}
                <section className={`${SECTION_SHELL} py-24`}>
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Built for <span className="text-accent">your team</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Any team that manages private infrastructure and can&apos;t open inbound ports
                        </p>
                    </div>

                    {/* An inset list, not a fifth grid of cards: these are short
                        answers to "is this for me?", read top to bottom. */}
                    <ul className="max-w-3xl mx-auto rounded-2xl border border-hairline bg-card divide-y divide-hairline overflow-hidden">
                        {targetMarkets.map((market) => (
                            <li key={market.title} className="flex items-start sm:items-center gap-4 px-5 sm:px-6 py-4">
                                <market.icon className="w-5 h-5 text-accent shrink-0 mt-0.5 sm:mt-0" />
                                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4 min-w-0 flex-1">
                                    <h3 className="font-medium text-foreground sm:w-52 shrink-0">{market.title}</h3>
                                    <p className="text-sm text-muted-foreground">{market.description}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* CTA */}
                <section id="get-started" className="py-24 px-4 scroll-mt-16">
                    <div className="container mx-auto max-w-5xl">
                        <div className="relative overflow-hidden rounded-[2rem] border border-accent/25 bg-[hsl(222_28%_4%)] px-6 py-16 sm:px-12 text-center">
                            {/* Layered light: a spotlight from above, a fine grid that
                                fades out, and a lit top edge — depth without a heavy
                                filled panel. */}
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--accent)/0.18),transparent_60%)]" />
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]" />
                            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

                            <div className="relative flex flex-col items-center">
                                <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-hairline bg-card/70 px-3 py-1.5 backdrop-blur-sm">
                                    <PhirepassLogo className="h-5 w-5" />
                                    <span className="text-xs font-medium tracking-wide text-muted-foreground">
                                        Install the agent once
                                    </span>
                                </div>

                                {/* Bookends the hero: the same three beats, closing the
                                    page on the line it opened with. */}
                                <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5">
                                    Reach it. Watch it.{" "}
                                    <span className="text-accent">Never expose it.</span>
                                </h2>
                                <p className="text-muted-foreground text-lg mb-10 max-w-xl">
                                    Access your node from any browser, and put its services under
                                    monitoring, in minutes.
                                </p>

                                <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-3">
                                    <Button
                                        variant="glow"
                                        size="lg"
                                        className="group h-14 px-9 text-base font-semibold"
                                        onClick={() => router.push("/login")}
                                    >
                                        Get started
                                        <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="lg"
                                        className="group h-14 px-9 text-base font-medium border border-hairline bg-card/50 backdrop-blur-sm hover:border-accent/40 hover:bg-accent/5"
                                        onClick={() =>
                                            document
                                                .getElementById("how-it-works")
                                                ?.scrollIntoView({ behavior: "smooth" })
                                        }
                                    >
                                        <Network className="mr-2 h-5 w-5 text-accent" />
                                        See how it works
                                    </Button>
                                </div>

                                <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                                    {["Outbound-only agent", "No inbound ports", "Works behind CG-NAT"].map((fact) => (
                                        <span key={fact} className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-accent" />
                                            {fact}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Darker than the page it closes, so the footer reads as a
                    separate band rather than more page. The background gradients
                    stop at its solid fill. */}
                <footer className="py-12 border-t border-hairline bg-[hsl(222_28%_3%)]">
                    {/* `container mx-auto px-4` — the same shell the dashboard uses
                        (Header.tsx, Nodes.tsx), so the footer lines up with the
                        signed-in pages. */}
                    <div className="container mx-auto px-4 flex flex-col gap-6">
                        <LegalLinks withGithub withContact />

                        {/* Name and copyright close the page, on their own last line. */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-2 border-t border-hairline pt-6 text-center">
                            <div className="flex items-center gap-3">
                                <PhirepassLogo className="w-8 h-8" />
                                <span className="font-semibold">Phirepass</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                © 2026 Phirepass. Secure remote access and uptime
                                monitoring, without the complexity.
                            </p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default Landing;
