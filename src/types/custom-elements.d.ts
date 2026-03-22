import type { CSSProperties } from 'react';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'phirepass-terminal': {
                'node-id'?: string;
                token?: string;
                style?: CSSProperties;
                class?: string;
                'aria-hidden'?: boolean | 'true' | 'false';
            };
        }
    }
}
