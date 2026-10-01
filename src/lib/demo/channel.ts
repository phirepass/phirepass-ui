import type { ChannelFactory, ChannelLike, ProtocolMessage, SFTPListItem } from 'phirepass-widgets';

import { DemoShell } from './shell';
import { demoHostFor } from './host-profile';
import {
    lookup,
    makeDir,
    remove,
    rename,
    sortedChildren,
    writeFile,
    type DemoHost,
    type FsEntry,
} from './host';

/**
 * The relay, the agent and the remote machine, as one object in the browser.
 *
 * `<phirepass-terminal>` and `<phirepass-sftp-client>` accept a
 * `channelFactory`; demo mode hands them this. Everything above the channel is
 * the real widget — xterm.js, the file browser, their login and reconnect
 * flows, their progress dialogs — and everything below it is the demo host.
 * That is the whole reason for doing it at this seam rather than drawing a
 * look-alike terminal: what a demo or a screenshot shows is the product.
 *
 * It speaks the same protocol messages the server would, in the same order:
 * open → `AuthSuccess` → `TunnelOpened` → data. Small delays sit between them
 * so the widgets' own "connecting" states are seen briefly, as on a fast real
 * link, rather than skipped.
 *
 * RDP is not here and cannot be: a desktop's pixels never cross this channel
 * (IronRDP opens its own socket), so demo mode shows a still image instead.
 */

const CHUNK_SIZE = 64 * 1024;
/** A pretend link speed for transfers, so the progress dialogs are seen. */
const BYTES_PER_SECOND = 12 * 1024 * 1024;
/** A binary fixture has no bytes; its download is a stand-in capped at this. */
const STAND_IN_CAP = 4 * 1024 * 1024;

/** Mirrors `ErrorType.Generic` in `phirepass-channel`. */
const ERROR_GENERIC = 0;

type Web = ProtocolMessage['data']['web'];
type Callback = (...args: unknown[]) => void;

function permissionsOf(entry: FsEntry): number {
    const bits = entry.mode.slice(1);
    let mode = 0;
    for (let i = 0; i < 9; i += 1) {
        if (bits[i] && bits[i] !== '-') mode |= 1 << (8 - i);
    }
    return (entry.type === 'dir' ? 0o040000 : 0o100000) | mode;
}

function modeString(type: FsEntry['type'], permissions: number): string {
    const chars = 'rwxrwxrwx';
    let out = type === 'dir' ? 'd' : '-';
    for (let i = 0; i < 9; i += 1) out += permissions & (1 << (8 - i)) ? chars[i] : '-';
    return out;
}

function standInBytes(entry: FsEntry & { type: 'file' }): Uint8Array {
    if (entry.content !== undefined) return new TextEncoder().encode(entry.content);
    // A binary fixture is only a name and a size. The download is real, so it
    // has to contain *something*: a short note, padded to a size that still
    // shows the progress dialog, never the full fictional size.
    const note = new TextEncoder().encode(
        `Phirepass demo — "${entry.name}" is a sample file; this download is a stand-in for its contents.\n`,
    );
    const bytes = new Uint8Array(Math.min(entry.size, STAND_IN_CAP));
    bytes.set(note.subarray(0, bytes.length));
    return bytes;
}

class DemoChannel implements ChannelLike {
    private readonly nodeId: string;
    private connected = false;
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();
    private onOpen: Callback | null = null;
    private onClose: Callback | null = null;
    private onMessage: Callback | null = null;

    private host: DemoHost | null = null;
    private shell: DemoShell | null = null;
    private sid = 0;
    private nextTransferId = 1;
    private readonly uploads = new Map<number, { path: string; parts: Uint8Array[]; totalChunks: number; size: number }>();

    constructor(nodeId: string) {
        this.nodeId = nodeId;
    }

    // --- plumbing -------------------------------------------------------------

    private later(ms: number, fn: () => void) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            if (this.connected) fn();
        }, ms);
        this.timers.add(timer);
    }

    private emit(web: Web) {
        const message: ProtocolMessage = { version: 1, encoding: 'MessagePack', data: { web } };
        this.onMessage?.(message);
    }

    private fail(message: string, msgId?: number | null) {
        this.emit({ type: 'Error', kind: ERROR_GENERIC as never, message, msg_id: msgId ?? undefined });
    }

    private writeTerminal(text: string) {
        this.emit({ type: 'TunnelData', node_id: this.nodeId, sid: this.sid, data: new TextEncoder().encode(text) });
    }

    private openTunnel(serviceId: string, kind: 'ssh' | 'sftp') {
        this.host = demoHostFor(this.nodeId, serviceId);
        if (!this.host) {
            this.later(200, () => this.fail('This node is not part of the demo fleet.'));
            return;
        }
        this.sid += 1;
        this.later(350, () => {
            this.emit({ type: 'TunnelOpened', sid: this.sid });
            if (kind === 'ssh') {
                this.shell?.dispose();
                this.shell = new DemoShell(this.host!, {
                    write: (data) => this.writeTerminal(data),
                    onExit: () => this.later(50, () => this.emit({ type: 'TunnelClosed', sid: this.sid })),
                });
                this.shell.start();
            }
        });
    }

    // --- connection -----------------------------------------------------------

    connect() {
        if (this.connected) return;
        this.connected = true;
        this.later(120, () => this.onOpen?.());
    }

    disconnect() {
        const was = this.connected;
        this.connected = false;
        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
        this.shell?.dispose();
        this.shell = null;
        if (was) this.onClose?.();
    }

    is_connected() {
        return this.connected;
    }

    authenticate() {
        this.later(180, () => this.emit({
            type: 'AuthSuccess',
            cid: `demo-${this.nodeId.slice(-4)}`,
            version: demoHostFor(this.nodeId, null)?.profile.agentVersion ?? 'demo',
        }));
    }

    start_heartbeat() {}
    stop_heartbeat() {}

    on_connection_open(cb?: Callback | null) { this.onOpen = cb ?? null; }
    on_connection_close(cb?: Callback | null) { this.onClose = cb ?? null; }
    on_connection_error() {}
    on_connection_message() {}
    on_protocol_message(cb?: Callback | null) { this.onMessage = cb ?? null; }

    // --- ssh ------------------------------------------------------------------

    open_ssh_tunnel(_nodeId: string, serviceId: string) {
        this.openTunnel(serviceId, 'ssh');
    }

    send_ssh_tunnel_data(_nodeId: string, _sid: number, data: string) {
        this.shell?.input(data);
    }

    send_ssh_terminal_resize(_nodeId: string, _sid: number, cols: number, rows: number) {
        this.shell?.resize(cols, rows);
    }

    // --- sftp -----------------------------------------------------------------

    open_sftp_tunnel(_nodeId: string, serviceId: string) {
        this.openTunnel(serviceId, 'sftp');
    }

    private item(path: string, entry: FsEntry, now: number): SFTPListItem {
        const modified = Math.floor((now - entry.ageMinutes * 60_000) / 1000);
        const owner = this.host!.profile.user;
        return {
            name: entry.name || '/',
            path,
            kind: entry.type === 'dir' ? 'Folder' : 'File',
            items: [],
            attributes: {
                size: entry.type === 'file' ? entry.size : 4096,
                uid: 1000,
                user: owner,
                gid: 1000,
                group: owner,
                permissions: permissionsOf(entry),
                atime: modified,
                modified,
            },
        };
    }

    send_sftp_list_data(_nodeId: string, sid: number, path: string, msgId?: number | null) {
        const host = this.host;
        if (!host) return;
        // The widget asks for `.` before it knows where it is; a real SFTP
        // server answers with the login directory, so this does too.
        const target = !path || path === '.' || path === '~' ? host.home : path;
        const entry = lookup(host, target);
        this.later(160, () => {
            if (!entry || entry.type !== 'dir') {
                this.fail(`No such file or directory: ${target}`, msgId);
                return;
            }
            const now = Date.now();
            const dir = this.item(target, entry, now);
            dir.items = sortedChildren(entry).map((child) =>
                this.item(`${target === '/' ? '' : target}/${child.name}`, child, now));
            this.emit({ type: 'SFTPListItems', path: target, sid, dir, msg_id: msgId ?? undefined });
        });
    }

    send_sftp_download_start(_nodeId: string, _sid: number, path: string, _filename: string, msgId?: number | null) {
        const entry = this.host ? lookup(this.host, path) : null;
        if (!entry || entry.type !== 'file') {
            this.later(100, () => this.fail(`No such file: ${path}`, msgId));
            return;
        }
        const bytes = standInBytes(entry);
        const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_SIZE));
        const downloadId = this.nextTransferId++;
        this.later(120, () => {
            this.emit({
                type: 'SFTPDownloadStartResponse',
                msg_id: msgId ?? undefined,
                response: { download_id: downloadId, total_size: bytes.length, total_chunks: totalChunks },
            });
            const perChunkMs = Math.max(4, (CHUNK_SIZE / BYTES_PER_SECOND) * 1000);
            for (let index = 0; index < totalChunks; index += 1) {
                this.later(40 + index * perChunkMs, () => {
                    const data = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
                    this.emit({
                        type: 'SFTPDownloadChunk',
                        msg_id: msgId ?? undefined,
                        chunk: { chunk_index: index, chunk_size: data.length, data: Array.from(data) },
                    });
                });
            }
        });
    }

    send_sftp_download_ack() {}

    send_sftp_upload_start(_nodeId: string, _sid: number, filename: string, remotePath: string, totalChunks: number, totalSize: bigint, msgId?: number | null) {
        const uploadId = this.nextTransferId++;
        const dir = remotePath === '/' ? '' : remotePath;
        this.uploads.set(uploadId, { path: `${dir}/${filename}`, parts: [], totalChunks, size: Number(totalSize) });
        this.later(120, () => this.emit({ type: 'SFTPUploadStartResponse', msg_id: msgId ?? undefined, response: { upload_id: uploadId } }));
    }

    send_sftp_upload_chunk(_nodeId: string, _sid: number, uploadId: number, chunkIndex: number, chunkSize: number, data: Uint8Array) {
        const upload = this.uploads.get(uploadId);
        if (!upload || !this.host) return;
        upload.parts[chunkIndex] = data.slice();
        const host = this.host;
        this.later(Math.max(4, (chunkSize / BYTES_PER_SECOND) * 1000), () => {
            if (upload.parts.filter(Boolean).length === upload.totalChunks) {
                this.uploads.delete(uploadId);
                // Small text files keep their contents, so `cat` in the shell
                // shows what was uploaded; anything else is kept as a size.
                let text: string | null = null;
                if (upload.size <= 256 * 1024) {
                    const joined = new Uint8Array(upload.size);
                    let offset = 0;
                    for (const part of upload.parts) { joined.set(part, offset); offset += part.length; }
                    try {
                        text = new TextDecoder('utf-8', { fatal: true }).decode(joined);
                    } catch {
                        text = null;
                    }
                }
                writeFile(host, upload.path, text, upload.size);
            }
            this.emit({ type: 'SFTPUploadChunkAck', upload_id: uploadId, chunk_index: chunkIndex });
        });
    }

    private op(msgId: number | null | undefined, sid: number, run: () => { ok: true } | { ok: false; error: string }) {
        this.later(140, () => {
            const result = this.host ? run() : { ok: false as const, error: 'No session' };
            if (result.ok) this.emit({ type: 'SFTPOpResult', sid, msg_id: msgId ?? undefined, result: { result: 'Done' } });
            else this.fail(result.error, msgId);
        });
    }

    send_sftp_mkdir(_nodeId: string, sid: number, path: string, msgId?: number | null) {
        this.op(msgId, sid, () => makeDir(this.host!, path));
    }

    send_sftp_rename(_nodeId: string, sid: number, from: string, to: string, msgId?: number | null) {
        this.op(msgId, sid, () => rename(this.host!, from, to));
    }

    send_sftp_remove(_nodeId: string, sid: number, path: string, recursive: boolean, msgId?: number | null) {
        this.op(msgId, sid, () => remove(this.host!, path, recursive));
    }

    send_sftp_chmod(_nodeId: string, sid: number, path: string, permissions: number, msgId?: number | null) {
        this.op(msgId, sid, () => {
            const entry = lookup(this.host!, path);
            if (!entry) return { ok: false, error: 'No such file or directory' };
            entry.mode = modeString(entry.type, permissions);
            return { ok: true };
        });
    }

    send_sftp_read_file(_nodeId: string, sid: number, path: string, msgId?: number | null) {
        const entry = this.host ? lookup(this.host, path) : null;
        this.later(140, () => {
            if (!entry || entry.type !== 'file') {
                this.fail(`No such file: ${path}`, msgId);
                return;
            }
            this.emit({
                type: 'SFTPOpResult',
                sid,
                msg_id: msgId ?? undefined,
                result: { result: 'FileContents', path, contents: standInBytes(entry) },
            });
        });
    }

    send_sftp_write_file(_nodeId: string, sid: number, path: string, contents: Uint8Array, msgId?: number | null) {
        this.op(msgId, sid, () => writeFile(this.host!, path, new TextDecoder().decode(contents)));
    }
}

/** What demo mode passes to the widgets as `channelFactory`. */
export const demoChannelFactory: ChannelFactory = (_endpoint, nodeId) => new DemoChannel(nodeId);
