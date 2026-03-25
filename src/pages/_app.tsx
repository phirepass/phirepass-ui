import type { AppProps } from 'next/app';
import ClientProviders from '@/app/providers';
import '@/index.css';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <ClientProviders>
            <Component {...pageProps} />
        </ClientProviders>
    );
}
