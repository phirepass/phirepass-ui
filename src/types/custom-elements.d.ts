import type { CSSProperties } from 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'phirepass-terminal': {
                'node-id'?: string;
                'server-id'?: string;
                'service-id'?: string;
                token?: string;
                style?: CSSProperties;
                class?: string;
                'aria-hidden'?: boolean | 'true' | 'false';
            };
            'phirepass-sftp-client': {
                'node-id'?: string;
                'server-id'?: string;
                'service-id'?: string;
                token?: string;
                style?: CSSProperties;
                class?: string;
                'aria-hidden'?: boolean | 'true' | 'false';
                'hide-header'?: boolean;
            };
            'phirepass-vnc': {
                'node-id'?: string;
                'server-id'?: string;
                'service-id'?: string;
                token?: string;
                style?: CSSProperties;
                class?: string;
                'aria-hidden'?: boolean | 'true' | 'false';
                'scale-viewport'?: boolean;
                'resize-session'?: boolean;
            };
        }
    }
}
