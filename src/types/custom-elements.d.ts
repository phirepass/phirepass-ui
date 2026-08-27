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
                /** Share the clipboard with the remote host. On by default. */
                clipboard?: boolean;
                ref?: Ref<PhirepassRdpElement>;
            };
        }
    }
}

/**
 * The methods `phirepass-rdp` exposes. What they have in common is that the
 * browser will not let the widget do any of it unprompted: fullscreen (and with
 * it the keyboard lock) is granted only to a user gesture, and Ctrl+Alt+Del and
 * the Meta key never reach the page at all — the operating system and the
 * browser take them first — so the app has to offer a control that sends them.
 *
 * The key methods answer `false` when there is no session yet to send to.
 */
export interface PhirepassRdpElement extends HTMLElement {
    toggleFullscreen(): Promise<boolean>;
    keyboardLockSupported(): Promise<boolean>;
    focusDesktop(): Promise<void>;
    sendCtrlAltDel(): Promise<boolean>;
    sendMetaKey(): Promise<boolean>;
}
