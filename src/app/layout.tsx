import type { Metadata } from "next";
import { ReactNode } from "react";
import ClientProviders from "./providers";
import "@/index.css";

export const metadata: Metadata = {
    title: "Phirepass",
    description: "Phirepass — secure access management",
};

export default function RootLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <ClientProviders>{children}</ClientProviders>
            </body>
        </html>
    );
}
