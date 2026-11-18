/**
 * What the Add download dialog (U2) accepts, as a pure rule: an http(s) link,
 * or a magnet when the node has Torrents on. The node checks everything again
 * (address guard, file name, torrents switch); this only stops a request that
 * cannot succeed and says why, in the words the widget's Fetch dialog uses.
 *
 * Import-free so `add-download.test.ts` runs under `node --test`.
 */

export type LinkSource = { Http: { url: string; save_as: string | null } } | { Magnet: { uri: string } };

export type LinkCheck =
    | { ok: true; source: LinkSource }
    /** `message` is null for an empty box: nothing to complain about yet. */
    | { ok: false; message: string | null };

export function readLink(raw: string, torrents: boolean): LinkCheck {
    const text = raw.trim();
    if (!text) return { ok: false, message: null };

    if (/^magnet:\?/i.test(text)) {
        if (!torrents) return { ok: false, message: 'Torrents are off on this node.' };
        if (!/[?&]xt=urn:bt[im]h:/i.test(text)) return { ok: false, message: 'This magnet has no torrent hash.' };
        return { ok: true, source: { Magnet: { uri: text } } };
    }

    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { ok: false, message: 'Paste a link that starts with https:// or a magnet link.' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, message: 'Only http and https links can be downloaded.' };
    }
    if (url.username || url.password) {
        // A login in the link would be stored with the row in the clear; the
        // login fields below are sealed by the node instead.
        return { ok: false, message: 'Remove the login from the link and enter it under “This link needs a login”.' };
    }
    return { ok: true, source: { Http: { url: url.toString(), save_as: null } } };
}

/** A link login as the wire carries it (`SourceAuth`, externally tagged). */
export type LinkLogin =
    | { Basic: { username: string; password: string } }
    | { Bearer: { token: string } }
    | { Header: { name: string; value: string } };

export type LoginKind = 'none' | 'basic' | 'bearer' | 'header';

export interface LoginFields {
    username: string;
    password: string;
    token: string;
    name: string;
    value: string;
}

/**
 * Header names a login may not set. A copy of `DENIED_AUTH_HEADERS` in
 * phirepass-rs `common/src/protocol/fetch.rs`, which the server and the node
 * check again; this only answers sooner.
 */
export const DENIED_LOGIN_HEADERS = [
    'host', 'content-length', 'range', 'if-range', 'transfer-encoding', 'connection',
    'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade',
];

export type LoginCheck =
    | { ok: true; auth: LinkLogin | null }
    | { ok: false; message: string | null };

/** U3: the login fields as a `SourceAuth`, or why not. Mirrors `SourceAuth::problem`. */
export function readLogin(kind: LoginKind, f: LoginFields): LoginCheck {
    const breaks = (...values: string[]) => values.some((v) => /[\r\n\0]/.test(v));
    switch (kind) {
        case 'none':
            return { ok: true, auth: null };
        case 'basic':
            if (!f.username) return { ok: false, message: null };
            if (breaks(f.username, f.password)) return { ok: false, message: 'A login cannot contain line breaks.' };
            if (f.username.includes(':')) return { ok: false, message: 'A username cannot contain a colon.' };
            return { ok: true, auth: { Basic: { username: f.username, password: f.password } } };
        case 'bearer':
            if (!f.token.trim()) return { ok: false, message: null };
            if (breaks(f.token)) return { ok: false, message: 'A login cannot contain line breaks.' };
            return { ok: true, auth: { Bearer: { token: f.token.trim() } } };
        case 'header': {
            const name = f.name.trim();
            if (!name || !f.value) return { ok: false, message: null };
            if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) return { ok: false, message: 'That is not a header name.' };
            if (DENIED_LOGIN_HEADERS.includes(name.toLowerCase())) {
                return { ok: false, message: 'That header cannot carry a login.' };
            }
            if (breaks(f.value)) return { ok: false, message: 'A login cannot contain line breaks.' };
            return { ok: true, auth: { Header: { name, value: f.value } } };
        }
    }
}

/** Who the login is sent to: the link's host, as U3 names it. */
export function loginHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return 'the link\'s site';
    }
}
