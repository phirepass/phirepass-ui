import type { Metadata } from "next";
import { ReactNode } from "react";
import Script from "next/script";
import ClientProviders from "./providers";
import "@/index.css";

export const metadata: Metadata = {
    title: "Phirepass — Remote Access & Uptime Monitoring",
    description:
        "Reach any machine behind NAT or a firewall from your browser — SSH, SFTP, and internal HTTP services — and monitor uptime internally and externally: external checks from our fleet, internal checks on your own agent, reaching services no public monitor can. Outbound-only agent, no open ports.",
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
                <ClientProviders>{children}</ClientProviders>
            </body>
        </html>
    );
}
