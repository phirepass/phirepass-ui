import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_UPDATED_ISO, LEGAL_UPDATED_LABEL } from "@/lib/legal";
import { OG_IMAGE } from "@/lib/site";

const TITLE = "Privacy Policy";
const DESCRIPTION =
    "What data Phirepass collects, why, how long it is kept, and who it is shared with.";

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/privacy" },
    // See the terms page: without an override these inherit the landing card.
    openGraph: {
        type: "article",
        title: `${TITLE} · Phirepass`,
        description: DESCRIPTION,
        url: "/privacy",
        modifiedTime: LEGAL_UPDATED_ISO,
        images: [OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        images: [OG_IMAGE.url],
        title: `${TITLE} · Phirepass`,
        description: DESCRIPTION,
    },
};

/**
 * Drafted from what the code actually does — the GitHub OAuth columns, the
 * session cookie, the agent telemetry fields and the analytics tag are all
 * described as implemented, not as a generic template. The bracketed values are
 * the ones only the operator can supply, and must be filled in before this is
 * relied upon. It has not been reviewed by a lawyer.
 */
export default function PrivacyPage() {
    return (
        <LegalPage
            title="Privacy Policy"
            updated={LEGAL_UPDATED_LABEL}
            intro="This policy explains what Phirepass collects when you use the dashboard and run an agent, why we collect it, and what we do with it. We have tried to describe the system as it actually works rather than in the broadest terms the law allows."
        >
            <LegalSection heading="1. Who we are">
                <p>
                    Phirepass is operated by <strong>[Company legal name]</strong>,{" "}
                    <strong>[registered address]</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
                    For anything in this policy, contact <strong>[privacy contact email]</strong>.
                </p>
            </LegalSection>

            <LegalSection heading="2. Account information">
                <p>
                    You sign in with GitHub. We request the <code>read:user</code> and{" "}
                    <code>user:email</code> scopes and store only what we need to identify your
                    account:
                </p>
                <ul>
                    <li>your email address;</li>
                    <li>your GitHub username;</li>
                    <li>your avatar URL;</li>
                    <li>the identity provider used (currently always GitHub).</li>
                </ul>
                <p>
                    We never receive your GitHub password, and we do not ask for or store a
                    password of our own.
                </p>
            </LegalSection>

            <LegalSection heading="3. Information your agents report">
                <p>
                    When you install an agent on a machine and connect it to your account, that
                    agent sends us information about itself so the dashboard can show it to you:
                </p>
                <ul>
                    <li>
                        <strong>Once, at login:</strong> hostname, operating system, agent version,
                        process id, local and interface IP addresses, MAC address, and the public
                        IP address the machine appears from, together with the approximate
                        geographic location derived from that address.
                    </li>
                    <li>
                        <strong>Periodically, while connected:</strong> CPU, memory, load, uptime,
                        process and connection counts for the machine and for the agent process.
                    </li>
                    <li>
                        <strong>Identity:</strong> the public half of an Ed25519 key pair the agent
                        generates on first run. The private key never leaves your machine.
                    </li>
                </ul>
                <p>
                    Where a machine is used by a person, some of this — a hostname, an IP address, a
                    location — may be personal data about that person. Install agents only on
                    machines you are entitled to administer.
                </p>
            </LegalSection>

            <LegalSection heading="4. Monitoring data">
                <p>
                    For each uptime monitor you create we store the check&rsquo;s configuration (the
                    target URL, method, expected status codes, any keyword you ask us to look for,
                    timeouts and thresholds) and the result of every check: the status code, the
                    response time, the verdict, any error message, and where relevant certificate or
                    domain registration details. Results are retained as history so we can show you
                    uptime over time.
                </p>
            </LegalSection>

            <LegalSection heading="5. What we do not collect">
                <p>
                    <strong>We do not record the contents of your sessions.</strong> Terminal
                    output, files transferred over SFTP, RDP screens and the bodies of proxied HTTP
                    requests pass through our relay in order to reach your browser, but they are
                    forwarded rather than stored. We keep no transcripts and no copies of your
                    files.
                </p>
                <p>
                    Operational logs may record connection metadata — timestamps, node identifiers,
                    error conditions — for the purpose of running and debugging the service.
                </p>
            </LegalSection>

            <LegalSection heading="6. Cookies and analytics">
                <p>
                    When you sign in we set one cookie, <code>phirepass_auth_token</code>. It holds
                    a signed session token, is <code>HttpOnly</code> and{" "}
                    <code>SameSite=Lax</code>, and expires after seven days. It is strictly
                    necessary: without it you cannot stay signed in.
                </p>
                <p>
                    Our public pages load <strong>Google Tag Manager</strong>, which may in turn
                    load analytics tags that set their own cookies and receive your IP address and
                    browsing activity on this site. Google acts as a separate controller for that
                    data; see Google&rsquo;s own privacy documentation for how it is handled.
                </p>
            </LegalSection>

            <LegalSection heading="7. Why we are allowed to process this">
                <p>
                    We process account, agent and monitoring data because it is necessary to perform
                    the contract we have with you — you cannot be given remote access to a machine
                    without us knowing which machine. We process security and operational logs on
                    the basis of our legitimate interest in keeping the service working and
                    protected from abuse. Analytics is based on consent where consent is required in
                    your jurisdiction.
                </p>
            </LegalSection>

            <LegalSection heading="8. Who we share it with">
                <ul>
                    <li>
                        <strong>GitHub</strong> — identity provider, at the moment you sign in.
                    </li>
                    <li>
                        <strong>Google</strong> — tag management and analytics on our public pages.
                    </li>
                    <li>
                        <strong>[Hosting provider]</strong> — infrastructure on which the service
                        and its databases run, located in <strong>[region]</strong>.
                    </li>
                </ul>
                <p>
                    We do not sell personal data, and we do not share it for advertising. We may
                    disclose data where we are legally required to.
                </p>
            </LegalSection>

            <LegalSection heading="9. How long we keep it">
                <p>
                    Account data is kept while your account exists. Node records and their reported
                    details are kept until you delete the node. Monitor results are kept as rolling
                    history for <strong>[retention period]</strong>. Deleting your account removes
                    your account record, your nodes, your access tokens and your monitors; backups
                    are cycled out within <strong>[backup retention period]</strong>.
                </p>
            </LegalSection>

            <LegalSection heading="10. Your rights">
                <p>
                    Depending on where you live, you may have the right to access, correct, export
                    or delete your personal data, to object to or restrict processing, and to
                    complain to your data protection authority. Write to{" "}
                    <strong>[privacy contact email]</strong> and we will respond within the period
                    the applicable law requires.
                </p>
            </LegalSection>

            <LegalSection heading="11. Security">
                <p>
                    Agents authenticate with an Ed25519 key pair whose private half never leaves the
                    machine, and hold only short-lived tokens; a personal access token is used once,
                    to enrol a node, and then not again. Browser sessions use a signed, HttpOnly
                    cookie over TLS. Access to a node can be revoked instantly, after which it
                    cannot reconnect without being enrolled again. No system is perfectly secure,
                    and we cannot guarantee absolute security.
                </p>
            </LegalSection>

            <LegalSection heading="12. Children">
                <p>
                    Phirepass is not intended for anyone under 16, and we do not knowingly collect
                    data from them.
                </p>
            </LegalSection>

            <LegalSection heading="13. Changes">
                <p>
                    If we change this policy we will update the date at the top of this page, and
                    for material changes we will tell you in the dashboard or by email before the
                    change takes effect.
                </p>
            </LegalSection>

            <LegalSection heading="14. Contact">
                <p>
                    Questions about this policy, or about the{" "}
                    <Link href="/terms">Terms of Service</Link>, go to{" "}
                    <strong>[privacy contact email]</strong>.
                </p>
            </LegalSection>
        </LegalPage>
    );
}
