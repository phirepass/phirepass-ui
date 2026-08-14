import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_UPDATED_ISO, LEGAL_UPDATED_LABEL } from "@/lib/legal";
import { OG_IMAGE } from "@/lib/site";

const TITLE = "Terms of Service";
const DESCRIPTION =
    "The terms you agree to when using Phirepass, including acceptable use of remote access and your responsibility for the machines you enrol.";

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/terms" },
    // Without these the page inherits the landing page's OpenGraph card, so a
    // shared link to the terms previews as the homepage.
    openGraph: {
        type: "article",
        title: `${TITLE} · Phirepass`,
        description: DESCRIPTION,
        url: "/terms",
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
 * A starting draft, not legal advice: the bracketed values must be filled in and
 * the whole document reviewed by a lawyer before it is relied upon. The
 * acceptable-use section is the one that matters most for a remote-access tool
 * and is written specifically for this product rather than copied.
 */
export default function TermsPage() {
    return (
        <LegalPage
            title="Terms of Service"
            updated={LEGAL_UPDATED_LABEL}
            intro="These terms govern your use of Phirepass. The short version: use it on machines you are entitled to administer, look after your tokens, and understand that a tool which reaches inside private networks carries responsibilities you cannot delegate to us."
        >
            <LegalSection heading="1. Agreement">
                <p>
                    These terms are between you and <strong>[Company legal name]</strong>,{" "}
                    <strong>[registered address]</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By
                    creating an account or connecting an agent you accept them. If you are agreeing
                    on behalf of an organisation, you confirm you are authorised to bind it.
                </p>
            </LegalSection>

            <LegalSection heading="2. What the service does">
                <p>
                    Phirepass lets you reach a machine you control from your browser — SSH, SFTP,
                    RDP and local HTTP services — through an agent that dials out to us, and lets
                    you run uptime checks against services from our servers or from that agent. We
                    may change, add or withdraw features; if we withdraw something you materially
                    rely on, we will give you reasonable notice.
                </p>
            </LegalSection>

            <LegalSection heading="3. Accounts and tokens">
                <p>
                    You sign in through GitHub and are responsible for the security of that account.
                    Personal access tokens, node identities and session cookies issued to you are
                    yours to protect: anything done through them is treated as done by you. Tell us
                    promptly at <strong>[security contact email]</strong> if you believe a token or
                    an account has been compromised, and revoke the affected node or token from the
                    dashboard.
                </p>
            </LegalSection>

            <LegalSection heading="4. Acceptable use">
                <p>
                    Phirepass exists to give you access to your own infrastructure. You must not use
                    it to:
                </p>
                <ul>
                    <li>
                        install an agent on, or obtain access to, any machine you do not own or are
                        not authorised in writing to administer;
                    </li>
                    <li>
                        bypass or defeat a network control — a firewall, an egress policy, a
                        segmentation boundary — that you are not entitled to bypass, including on a
                        network belonging to an employer, client or third party;
                    </li>
                    <li>
                        monitor, probe or send traffic to systems that are not yours and that you do
                        not have permission to test;
                    </li>
                    <li>
                        conceal an intrusion, exfiltrate data, or maintain access someone else has
                        revoked;
                    </li>
                    <li>
                        break the law, infringe others&rsquo; rights, or distribute malware through
                        the service;
                    </li>
                    <li>
                        attack the service itself, or place load on it deliberately beyond ordinary
                        use.
                    </li>
                </ul>
                <p>
                    An outbound-only agent is not a licence to bypass a control someone else put
                    there on purpose. Getting that authorisation is your responsibility, and we may
                    ask you to demonstrate it.
                </p>
            </LegalSection>

            <LegalSection heading="5. The machines you enrol">
                <p>
                    You remain responsible for the machines you connect and the services you expose
                    through them, including keeping them patched, deciding who in your organisation
                    may reach them, and complying with any law or contract that governs the data on
                    them. We give you the tunnel; what travels through it is yours.
                </p>
            </LegalSection>

            <LegalSection heading="6. Availability">
                <p>
                    We aim to keep the service running but do not promise it will be uninterrupted
                    or error-free, and it is provided <strong>&ldquo;as is&rdquo;</strong> without
                    warranties of any kind to the fullest extent the law allows. Uptime monitoring
                    is a best-effort signal about your services, not a guarantee that you will be
                    told about every outage. Do not rely on it as the only alarm for something whose
                    failure you cannot afford to miss.
                </p>
            </LegalSection>

            <LegalSection heading="7. Limitation of liability">
                <p>
                    To the extent permitted by law, we are not liable for indirect or consequential
                    loss, lost profits, lost data, or business interruption. Our total liability
                    arising out of or relating to the service is limited to{" "}
                    <strong>[liability cap — e.g. the fees you paid in the previous 12 months]</strong>
                    . Nothing here excludes liability that cannot lawfully be excluded.
                </p>
            </LegalSection>

            <LegalSection heading="8. Suspension and termination">
                <p>
                    You may stop using the service and delete your account at any time. We may
                    suspend or terminate access if you breach these terms, if your use puts the
                    service or other users at risk, or if we are legally required to. Where
                    circumstances allow, we will tell you first.
                </p>
            </LegalSection>

            <LegalSection heading="9. Privacy">
                <p>
                    Our handling of personal data is described in the{" "}
                    <Link href="/privacy">Privacy Policy</Link>, which forms part of these terms.
                </p>
            </LegalSection>

            <LegalSection heading="10. Changes to these terms">
                <p>
                    We may update these terms; the date at the top of this page shows when. For
                    material changes we will give notice in the dashboard or by email before they
                    take effect, and continuing to use the service afterwards means you accept them.
                </p>
            </LegalSection>

            <LegalSection heading="11. Governing law">
                <p>
                    These terms are governed by the laws of <strong>[jurisdiction]</strong>, and the
                    courts of <strong>[venue]</strong> have exclusive jurisdiction over any dispute,
                    without prejudice to mandatory consumer protections in your country of
                    residence.
                </p>
            </LegalSection>

            <LegalSection heading="12. Contact">
                <p>
                    Questions about these terms: <strong>[legal contact email]</strong>.
                </p>
            </LegalSection>
        </LegalPage>
    );
}
