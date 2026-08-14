import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import Script from "next/script";
import ClientProviders from "./providers";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import "@/index.css";

const TITLE = "Phirepass — Remote Access & Uptime Monitoring";
// Kept under ~160 characters so search results show the whole line, with the
// differentiator (internal checks) inside the visible window rather than past
// the truncation point.
const DESCRIPTION =
    "Browser-based SSH, SFTP and internal web access to any machine behind NAT — plus uptime monitoring for the private services public monitors can't reach.";

export const viewport: Viewport = {
    // Matches the manifest's theme_color, so the installed app's chrome and the
    // browser address bar are the same near-black.
    themeColor: "#0b0d12",
    width: "device-width",
    initialScale: 1,
    // `black-translucent` draws the app under the iOS status bar, so the layout
    // must extend into it and pad itself back with the safe-area insets. Without
    // this the sticky header sits beneath the notch.
    viewportFit: "cover",
};

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: TITLE,
        // Per-page titles read "Sign in · Phirepass" rather than repeating the
        // full landing title on every route.
        template: "%s · Phirepass",
    },
    description: DESCRIPTION,
    applicationName: "Phirepass",
    appleWebApp: {
        capable: true,
        title: "Phirepass",
        statusBarStyle: "black-translucent",
    },
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        siteName: "Phirepass",
        url: SITE_URL,
        title: TITLE,
        description: DESCRIPTION,
        images: [OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
        images: ["/listing.png"],
    },
};

export default function RootLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <Script id="gtm" strategy="afterInteractive">
                    {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                    })(window,document,'script','dataLayer','GTM-PCNKQVFS');`}
                </Script>
            </head>
            <body>
                <noscript>
                    <iframe
                        src="https://www.googletagmanager.com/ns.html?id=GTM-PCNKQVFS"
                        height="0"
                        width="0"
                        style={{ display: "none", visibility: "hidden" }}
                    />
                </noscript>
                <ServiceWorkerRegistration />
                <ClientProviders>{children}</ClientProviders>
            </body>
        </html>
    );
}
