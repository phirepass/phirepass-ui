import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PhirepassLogo } from '@/components/PhirepassLogo';
import { LegalLinks } from '@/components/LegalLinks';

import type { ReactNode } from 'react';

/**
 * Shared shell for the terms and privacy pages, so the two cannot drift apart
 * in styling the way the login and signup panels once did.
 */
export function LegalPage({
    title,
    updated,
    intro,
    children,
}: {
    title: string;
    /** Human-readable date, shown to the reader and used as the revision marker. */
    updated: string;
    intro: string;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <PhirepassLogo className="w-8 h-8" />
                        <span className="text-xl font-semibold tracking-tight">
                            <span className="text-gradient">Phire</span>
                            <span className="text-foreground">pass</span>
                        </span>
                    </Link>
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to site
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-16">
                <h1 className="text-4xl font-bold tracking-tight mb-3">{title}</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: {updated}</p>
                <p className="text-lg text-muted-foreground leading-relaxed mb-12">{intro}</p>

                <div className="space-y-10">{children}</div>
            </main>

            {/* Same band as the landing page's footer: darker than the page, so
                it closes the document rather than trailing off. */}
            <footer className="border-t border-border bg-[hsl(222_28%_3%)]">
                {/* Same order as the landing footer: links first, the name and
                    copyright closing on the last line. */}
                <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
                    <LegalLinks termsLabel="Terms of Service" privacyLabel="Privacy Policy" withGithub />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-2 border-t border-border/60 pt-6 text-center">
                        <Link href="/" className="flex items-center gap-3">
                            <PhirepassLogo className="w-8 h-8" />
                            <span className="font-semibold">Phirepass</span>
                        </Link>
                        <p className="text-sm text-muted-foreground">
                            © 2026 Phirepass. Secure remote access and uptime monitoring.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

/** One numbered section of a legal document. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
    return (
        <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">{heading}</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_strong]:text-foreground [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
                {children}
            </div>
        </section>
    );
}
