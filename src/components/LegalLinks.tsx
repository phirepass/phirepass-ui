import Link from 'next/link';
import { FileText, ShieldCheck } from 'lucide-react';

import { ContactSupportLink } from '@/components/ContactSupportDialog';
import { LinkBadge as Badge } from '@/components/LinkBadge';
import { cn } from '@/lib/utils';

/**
 * The Terms and Privacy links, in one place because they appear in four: the
 * landing footer, the legal pages' own footer, and the consent line under both
 * auth forms. Each carries a circular icon badge that lights on hover (shared
 * with the contact trigger, which joins the row where `withContact` is set).
 */
const GITHUB_URL = 'https://github.com/orgs/phirepass/repositories';

export function TermsLink({ label = 'Terms', className }: { label?: string; className?: string }) {
    return (
        <Link
            href="/terms"
            className={cn(
                'group inline-flex items-center gap-2 align-middle transition-colors hover:text-foreground',
                className,
            )}
        >
            <Badge icon={FileText} />
            {label}
        </Link>
    );
}

export function PrivacyLink({ label = 'Privacy', className }: { label?: string; className?: string }) {
    return (
        <Link
            href="/privacy"
            className={cn(
                'group inline-flex items-center gap-2 align-middle transition-colors hover:text-foreground',
                className,
            )}
        >
            <Badge icon={ShieldCheck} />
            {label}
        </Link>
    );
}

export function GithubLink({ className }: { className?: string }) {
    return (
        <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
                'group inline-flex items-center gap-2 align-middle transition-colors hover:text-foreground',
                className,
            )}
        >
            <Badge>
                {/* lucide dropped its brand icons, so the mark is inline. */}
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
            </Badge>
            GitHub
        </a>
    );
}

/** The row used in footers. */
export function LegalLinks({
    termsLabel,
    privacyLabel,
    withGithub = false,
    withContact = false,
    className,
}: {
    termsLabel?: string;
    privacyLabel?: string;
    withGithub?: boolean;
    /** Adds the support form's trigger; omitted under the auth forms, where the
        row is a consent line rather than a footer. */
    withContact?: boolean;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground', className)}>
            <TermsLink label={termsLabel} />
            <PrivacyLink label={privacyLabel} />
            {withGithub ? <GithubLink /> : null}
            {withContact ? <ContactSupportLink /> : null}
        </div>
    );
}
