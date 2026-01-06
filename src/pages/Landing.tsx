import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Terminal,
    BookOpen,
    Shield,
    Globe,
    Server,
    FolderSync,
    Zap,
    ArrowRight,
    CheckCircle2,
    Monitor,
    Users,
    Building2,
    GraduationCap,
    Headphones,
    Lock,
    Cpu,
    Wifi,
} from "lucide-react";

const Landing = () => {
    const router = useRouter();

    const valueProps = [
        {
            icon: Globe,
            title: "Zero-Install Access",
            description:
                "Access your nodes from any device with a web browser. No SSH clients, no FTP software, no configuration hassles.",
            highlight:
                "Perfect for contractors, remote teams, and BYOD environments",
        },
        {
            icon: Shield,
            title: "Secure by Design",
            description:
                "All connections relay through your controlled infrastructure. No direct server exposure to the internet.",
            highlight: "Centralized access control and audit logging",
        },
        {
            icon: Zap,
            title: "Instant Productivity",
            description:
                "Full xterm.js terminal with SSH access. Visual SFTP file browser with drag-and-drop support.",
            highlight: "Switch between terminal and files seamlessly",
        },
        {
            icon: Building2,
            title: "Enterprise-Ready",
            description:
                "Lightweight daemon runs on target nodes. Scalable relay server architecture with WebSocket performance.",
            highlight: "Built for security and speed",
        },
    ];

    const targetMarkets = [
        {
            icon: Cpu,
            title: "DevOps/SRE Teams",
            description: "Quick server access for distributed teams",
        },
        {
            icon: Server,
            title: "MSPs & Hosting Providers",
            description: "Offer browser-based server management to customers",
        },
        {
            icon: GraduationCap,
            title: "Education",
            description: "Give students server access without local tooling",
        },
        {
            icon: Lock,
            title: "Compliance-Focused Orgs",
            description: "Centralized access control and logging",
        },
        {
            icon: Headphones,
            title: "Support Teams",
            description: "Temporary, auditable server access",
        },
    ];

    const features = [
        "Browser-based SSH terminal access",
        "Visual SFTP file management",
        "Multi-node orchestration",
        "Real-time WebSocket performance",
        "Centralized audit logging",
        "No VPN configuration required",
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
                            WebSocket-Powered • Real-Time Access
                        </span>
                    </div>

                    {/* Main title */}
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-center mb-6 animate-fade-in tracking-tight">
                        <span className="text-foreground">Phirepass</span>
                    </h1>

                    {/* Tagline */}
                    <p className="text-xl md:text-2xl lg:text-3xl text-center mb-6 animate-fade-in font-medium">
                        <span className="text-primary">
                            Secure SSH & SFTP Access, Anywhere.
                        </span>
                    </p>

                    {/* Subtitle */}
                    <p className="text-lg md:text-xl text-muted-foreground text-center max-w-3xl mb-4 animate-fade-in">
                        No VPN. No Client Software. No Compromises.
                    </p>

                    <p className="text-base text-muted-foreground text-center max-w-2xl mb-12 animate-fade-in leading-relaxed">
                        Give your team instant SSH terminal and SFTP access to
                        any server—directly from their browser. Simply install
                        our lightweight daemon, and access beautiful terminal
                        and file management interfaces from anywhere.
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
                            Get Started Free
                            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            className="text-lg px-8 py-6 border-border hover:border-accent/50 hover:bg-accent/5"
                            onClick={() =>
                                window.open(
                                    "https://docs.example.com",
                                    "_blank"
                                )
                            }
                        >
                            <BookOpen className="w-5 h-5 mr-2" />
                            Documentation
                        </Button>
                    </div>

                    {/* Quick features */}
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
                        {[
                            "Browser-Based",
                            "Zero-Install",
                            "Enterprise-Ready",
                            "WebSocket-Powered",
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-accent" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/*

        <section className="px-6 py-24 max-w-8xl mx-auto">
        <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Remote Access <span className="text-accent">Without the Complexity</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Browser-based remote server access for modern teams
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {valueProps.map((prop, index) => (
            <div
                key={prop.title}
                className="group p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-accent/50 transition-all duration-300"
                style={{ animationDelay: `${index * 100}ms` }}
            >
                <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <prop.icon className="w-7 h-7 text-accent" />
                </div>
                <h3 className="font-bold text-xl text-foreground mb-3">{prop.title}</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">{prop.description}</p>
                <p className="text-sm text-accent font-medium">{prop.highlight}</p>
            </div>
            ))}
        </div>
        </section>

        <section className="px-6 py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

        <div className="max-w-6xl mx-auto relative">
            <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
                Instant <span className="text-accent">Productivity</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Full xterm.js terminal with SSH access and visual SFTP file browser
            </p>
            </div>

            <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-2xl shadow-accent/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
                <div className="w-3 h-3 rounded-full bg-destructive/80" />
                <div className="w-3 h-3 rounded-full bg-warning/80" />
                <div className="w-3 h-3 rounded-full bg-success/80" />
                <span className="ml-4 text-sm text-muted-foreground font-mono">phirepass — ssh session</span>
            </div>

            <div className="p-6 font-mono text-sm bg-background">
                <div className="text-accent mb-2">$ phirepass connect production-server</div>
                <div className="text-muted-foreground mb-2">Establishing secure WebSocket tunnel...</div>
                <div className="text-success mb-2">✓ Connected via relay.phirepass.io</div>
                <div className="text-foreground mb-2">Last login: Thu Jan 02 10:24:31 2026 from relay</div>
                <div className="text-muted-foreground mb-4">Welcome to Ubuntu 24.04.1 LTS</div>
                <div className="flex items-center text-accent">
                <span>admin@production:~$</span>
                <span className="ml-1 w-2 h-5 bg-accent animate-pulse" />
                </div>
            </div>
            </div>
        </div>
        </section>

        <section className="px-6 py-24 max-w-8xl mx-auto">
        <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Built for <span className="text-accent">Your Team</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Whether you manage 5 nodes or 5,000, Phirepass scales with you
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

        <section className="px-6 py-24 bg-secondary/20">
        <div className="max-w-8xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Everything You Need,<br />
                <span className="text-accent">Nothing You Don't</span>
                </h2>
                <p className="text-muted-foreground text-lg mb-8">
                Phirepass is purpose-built for SSH and SFTP access. No bloated features,
                no complex identity management—just fast, secure server access.
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
                { icon: Terminal, label: "SSH Terminal", desc: "Full xterm.js" },
                { icon: FolderSync, label: "SFTP Browser", desc: "Drag & drop" },
                { icon: Monitor, label: "Multi-Node", desc: "Orchestration" },
                { icon: Users, label: "Team Access", desc: "Centralized" }
                ].map((item) => (
                <div key={item.label} className="aspect-square rounded-2xl border border-border bg-card/50 p-6 flex flex-col items-center justify-center gap-3 hover:border-accent/50 transition-colors">
                    <item.icon className="w-10 h-10 text-accent" />
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

        <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
            <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.1),transparent_60%)]" />

            <div className="relative">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Simplify Server Access?
                </h2>
                <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                Install the daemon, connect your nodes, and access them from any browser in minutes.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                    variant="glow"
                    size="lg"
                    className="text-lg px-10 py-6 group"
                    onClick={() => router.push("/login")}
                >
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button
                    variant="outline"
                    size="lg"
                    className="text-lg px-10 py-6"
                    onClick={() => window.open("https://docs.example.com", "_blank")}
                >
                    View Documentation
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
                        </div>
                    </div>
                </footer>
*/}
            </div>
        </div>
    );
};

export default Landing;
