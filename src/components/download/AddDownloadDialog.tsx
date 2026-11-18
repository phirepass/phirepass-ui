'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { loginHost, readLink, readLogin, type LinkLogin, type LoginFields, type LoginKind } from './add-download';
import type { DownloadNode, StartSource } from './use-download-feed';

/**
 * Add download (screen U2). Only nodes with Downloads on are offered; an
 * offline one can be chosen and the row waits for it. A magnet needs Torrents
 * on that node and an order, because "watch while it downloads" costs speed
 * and nobody should get it by default or lose it by default.
 */
export function AddDownloadDialog({
    open,
    onOpenChange,
    nodes,
    onAdd,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nodes: readonly DownloadNode[];
    onAdd: (nodeId: string, source: StartSource, inOrder: boolean | null, auth: LinkLogin | null) => boolean;
}) {
    const eligible = nodes.filter((node) => node.downloads);
    const [nodeId, setNodeId] = useState<string>('');
    const [link, setLink] = useState('');
    const [order, setOrder] = useState<'in-order' | 'fastest' | null>(null);
    const [loginKind, setLoginKind] = useState<LoginKind>('none');
    const [login, setLogin] = useState<LoginFields>(EMPTY_LOGIN);

    const node = eligible.find((entry) => entry.id === nodeId) ?? eligible.find((entry) => entry.online) ?? eligible[0];
    const parsed = readLink(link, node?.torrents ?? false);
    const needsOrder = parsed.ok && 'Magnet' in parsed.source;
    const httpUrl = parsed.ok && 'Http' in parsed.source ? parsed.source.Http.url : null;
    const loginCheck = httpUrl ? readLogin(loginKind, login) : { ok: true as const, auth: null };
    const ready = !!node && parsed.ok && (!needsOrder || order !== null) && loginCheck.ok;

    const reset = () => {
        setLink('');
        setOrder(null);
        setLoginKind('none');
        setLogin(EMPTY_LOGIN);
    };

    const add = () => {
        if (!node || !parsed.ok || !loginCheck.ok) return;
        const inOrder = needsOrder ? order === 'in-order' : null;
        if (onAdd(node.id, parsed.source, inOrder, loginCheck.auth)) {
            reset();
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add download</DialogTitle>
                    <DialogDescription>The node downloads it into its download folder and carries on by itself.</DialogDescription>
                </DialogHeader>

                {eligible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No node has Downloads turned on. Turn it on from a node&apos;s card on the Nodes page.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[12px] font-medium text-foreground">Node</span>
                            <select
                                className="w-full rounded-[8px] border border-hairline bg-transparent px-2.5 py-2 text-[13px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                                value={node?.id ?? ''}
                                onChange={(event) => setNodeId(event.target.value)}
                            >
                                {eligible.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.name} · {entry.online ? 'online' : 'offline, will start when it connects'}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block space-y-1.5">
                            <span className="text-[12px] font-medium text-foreground">Link or magnet</span>
                            <Input
                                value={link}
                                placeholder="https://… or magnet:?…"
                                onChange={(event) => setLink(event.target.value)}
                                autoFocus
                            />
                            {!parsed.ok && parsed.message ? (
                                <span className="block text-[11px] text-destructive">{parsed.message}</span>
                            ) : null}
                        </label>

                        {httpUrl ? (
                            <LoginSection
                                host={loginHost(httpUrl)}
                                kind={loginKind}
                                onKind={setLoginKind}
                                fields={login}
                                onFields={setLogin}
                                message={loginCheck.ok ? null : loginCheck.message}
                            />
                        ) : null}

                        {needsOrder ? (
                            <fieldset className="space-y-1.5">
                                <legend className="text-[12px] font-medium text-foreground">How should it download?</legend>
                                <div className="mac-squircle divide-y divide-hairline rounded-[9px] border border-hairline">
                                    {([
                                        ['in-order', 'In order', 'watch while it downloads, a little slower'],
                                        ['fastest', 'Fastest', 'any order; switch to in order later if you want to watch'],
                                    ] as const).map(([value, label, detail]) => (
                                        <label key={value} className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
                                            <input
                                                type="radio"
                                                name="download-order"
                                                className="mt-0.5"
                                                checked={order === value}
                                                onChange={() => setOrder(value)}
                                            />
                                            <span className="text-[12px]">
                                                <span className={cn('font-medium', order === value ? 'text-foreground' : 'text-foreground/90')}>{label}</span>
                                                <span className="text-muted-foreground"> · {detail}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        ) : null}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={!ready} onClick={add}>Add</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const EMPTY_LOGIN: LoginFields = { username: '', password: '', token: '', name: '', value: '' };

const LOGIN_KINDS: readonly [LoginKind, string][] = [
    ['none', 'No login'],
    ['basic', 'Username and password'],
    ['bearer', 'Bearer token'],
    ['header', 'Custom header'],
];

/**
 * U3: a login for a link, collapsed until asked for. The fields go to the
 * node in the Start and nowhere else; the note says where they are sent and
 * how they are kept, because a person typing a token deserves to know.
 */
function LoginSection({
    host,
    kind,
    onKind,
    fields,
    onFields,
    message,
}: {
    host: string;
    kind: LoginKind;
    onKind: (kind: LoginKind) => void;
    fields: LoginFields;
    onFields: (fields: LoginFields) => void;
    message: string | null;
}) {
    const [open, setOpen] = useState(kind !== 'none');
    const set = (key: keyof LoginFields) => (event: React.ChangeEvent<HTMLInputElement>) =>
        onFields({ ...fields, [key]: event.target.value });

    if (!open) {
        return (
            <button type="button" className="text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
                This link needs a login
            </button>
        );
    }
    return (
        <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-foreground">This link needs a login</legend>
            <div role="radiogroup" aria-label="Login" className="inline-flex flex-wrap rounded-full bg-white/[0.05] p-0.5 ring-1 ring-hairline">
                {LOGIN_KINDS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={kind === value}
                        onClick={() => onKind(value)}
                        className={cn(
                            'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                            kind === value ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {kind === 'basic' ? (
                <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Username" autoComplete="off" value={fields.username} onChange={set('username')} />
                    <Input placeholder="Password" type="password" autoComplete="new-password" value={fields.password} onChange={set('password')} />
                </div>
            ) : kind === 'bearer' ? (
                <Input placeholder="Token" type="password" autoComplete="off" value={fields.token} onChange={set('token')} />
            ) : kind === 'header' ? (
                <div className="grid grid-cols-[2fr_3fr] gap-2">
                    <Input placeholder="Header, e.g. X-Api-Key" autoComplete="off" value={fields.name} onChange={set('name')} />
                    <Input placeholder="Value" type="password" autoComplete="off" value={fields.value} onChange={set('value')} />
                </div>
            ) : null}
            {message ? <span className="block text-[11px] text-destructive">{message}</span> : null}
            {kind !== 'none' ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Sent only to {host}, and dropped if the link redirects to another site. Sealed by the node, kept
                    only as ciphertext until the download finishes, then deleted.
                </p>
            ) : null}
        </fieldset>
    );
}
