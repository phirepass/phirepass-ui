import type { CSSProperties, Ref } from 'react';

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
            'phirepass-rdp': {
                'node-id'?: string;
                'server-id'?: string;
                'service-id'?: string;
                token?: string;
                style?: CSSProperties;
                class?: string;
                'aria-hidden'?: boolean | 'true' | 'false';
                /** `host:port` as the remote knows itself, for the CredSSP SPN. */
                destination?: string;
                username?: string;
                password?: string;
                scale?: 'fit' | 'full' | 'real';
                /** Match the remote resolution to the widget as it is resized. */
                'dynamic-resize'?: boolean;
                /** Take the browser's own shortcuts while fullscreen. */
                'capture-keyboard'?: boolean;
                ref?: Ref<PhirepassRdpElement>;
            };
        }
    }
}

/**
 * The methods `phirepass-rdp` exposes. Only fullscreen is driven from the app:
 * it is the one thing the widget cannot start on its own, because the browser
 * grants fullscreen (and with it the keyboard lock) only to a user gesture.
 */
export interface PhirepassRdpElement extends HTMLElement {
    toggleFullscreen(): Promise<boolean>;
    keyboardLockSupported(): Promise<boolean>;
    focusDesktop(): Promise<void>;
}
