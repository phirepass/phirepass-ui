'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import {
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers,
    placeholder as placeholderExtension,
} from '@codemirror/view';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * A Lua editor, because a transform is code and a `<textarea>` is not an editor.
 *
 * CodeMirror rather than Monaco: Monaco is a megabyte-scale editor that expects
 * to own its own worker threads, and what is needed here is syntax, line
 * numbers, bracket matching and undo over roughly twenty lines of Lua. The
 * language comes from the legacy stream mode, which is the supported way to get
 * Lua on CodeMirror 6 — there is no Lezer grammar for it.
 *
 * The theme is written against the app's own CSS variables rather than an
 * off-the-shelf dark theme, so the editor is the same material as the panel
 * around it instead of a black rectangle pasted into the page.
 */

/** Highlighting mapped onto the palette the rest of the dashboard uses. */
const HIGHLIGHT = HighlightStyle.define([
    { tag: tags.keyword, color: 'hsl(var(--violet))' },
    { tag: tags.controlKeyword, color: 'hsl(var(--violet))' },
    { tag: tags.operatorKeyword, color: 'hsl(var(--violet))' },
    { tag: [tags.string, tags.special(tags.string)], color: 'hsl(var(--success))' },
    { tag: tags.number, color: 'hsl(var(--warning))' },
    { tag: tags.bool, color: 'hsl(var(--warning))' },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
    { tag: tags.variableName, color: 'hsl(var(--foreground))' },
    { tag: tags.function(tags.variableName), color: 'hsl(var(--info))' },
    { tag: tags.definition(tags.variableName), color: 'hsl(var(--info))' },
    { tag: tags.operator, color: 'hsl(var(--muted-foreground))' },
    { tag: tags.punctuation, color: 'hsl(var(--muted-foreground))' },
]);

function theme(minHeight: string): Extension {
    return EditorView.theme({
        '&': {
            backgroundColor: 'transparent',
            color: 'hsl(var(--foreground))',
            fontSize: '12px',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            lineHeight: '1.65',
            minHeight,
        },
        '.cm-content': { padding: '10px 0', caretColor: 'hsl(var(--accent))' },
        '.cm-gutters': {
            backgroundColor: 'transparent',
            color: 'hsl(var(--muted-foreground) / 0.5)',
            border: 'none',
            paddingRight: '4px',
        },
        '.cm-activeLine': { backgroundColor: 'hsl(var(--foreground) / 0.04)' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--accent))' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: 'hsl(var(--accent) / 0.25)',
        },
        '.cm-placeholder': { color: 'hsl(var(--muted-foreground) / 0.6)' },
    }, { dark: true });
}

interface LuaEditorProps {
    value: string;
    onChange: (value: string) => void;
    /** Labels the editor for assistive technology; it is not a native control. */
    label: string;
    placeholder?: string;
    minHeight?: string;
    className?: string;
}

/** The editor surface, without the chrome around it. */
function CodeSurface({ value, onChange, label, placeholder, minHeight = '160px', className }: LuaEditorProps) {
    const host = useRef<HTMLDivElement | null>(null);
    const view = useRef<EditorView | null>(null);
    // Held in a ref so the update listener — installed once with the view — can
    // reach the latest callback without the view being torn down on every
    // keystroke, which would lose focus and the cursor with it.
    const emit = useRef(onChange);
    useEffect(() => {
        emit.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (!host.current) return;

        const instance = new EditorView({
            parent: host.current,
            state: EditorState.create({
                doc: value,
                extensions: [
                    lineNumbers(),
                    highlightActiveLine(),
                    highlightActiveLineGutter(),
                    history(),
                    // `indentWithTab` last, so Tab indents inside the editor —
                    // accepting that it costs tab-to-leave, which Escape then
                    // Tab still provides.
                    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
                    StreamLanguage.define(lua),
                    syntaxHighlighting(HIGHLIGHT),
                    EditorView.lineWrapping,
                    theme(minHeight),
                    placeholder ? placeholderExtension(placeholder) : [],
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) emit.current(update.state.doc.toString());
                    }),
                    EditorView.contentAttributes.of({ 'aria-label': label }),
                ],
            }),
        });

        view.current = instance;
        return () => {
            instance.destroy();
            view.current = null;
        };
        // Built once: subsequent value changes are pushed in through the effect
        // below rather than by rebuilding the editor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // External changes — undo, switching steps, the expanded copy of this same
    // editor — are written in. Guarded by a comparison, or every keystroke
    // would echo back and collapse the selection.
    useEffect(() => {
        const instance = view.current;
        if (!instance) return;

        const current = instance.state.doc.toString();
        if (current === value) return;

        instance.dispatch({
            changes: { from: 0, to: current.length, insert: value },
        });
    }, [value]);

    return (
        <div
            ref={host}
            className={cn(
                'overflow-hidden rounded-lg border border-hairline bg-black/25 transition-colors focus-within:border-accent/60',
                className
            )}
        />
    );
}

/**
 * The inline editor, plus the way out of it.
 *
 * A transform that grows past a dozen lines is unreadable in an inspector
 * column, and the answer is not to make the column wider for everything else —
 * so the same document opens in a full-size modal, and both surfaces write to
 * the same value.
 */
export function LuaEditor({ value, onChange, label, placeholder, minHeight, className }: LuaEditorProps) {
    const [expanded, setExpanded] = useState(false);
    const lines = value === '' ? 0 : value.split('\n').length;

    return (
        <div className="space-y-1.5">
            <CodeSurface
                value={value}
                onChange={onChange}
                label={label}
                placeholder={placeholder}
                minHeight={minHeight}
                className={className}
            />

            <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                    Lua · {lines} line{lines === 1 ? '' : 's'}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setExpanded(true)}
                >
                    <Maximize2 className="h-3 w-3" />
                    Expand
                </Button>
            </div>

            <Dialog open={expanded} onOpenChange={setExpanded}>
                <DialogContent className="flex h-[82vh] max-w-[min(900px,94vw)] flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Minimize2 className="h-4 w-4 text-muted-foreground" />
                            {label}
                        </DialogTitle>
                        <DialogDescription>
                            Runs on the agent. <span className="font-mono text-xs">input</span> holds the previous
                            step&apos;s output; whatever you <span className="font-mono text-xs">return</span> becomes
                            this step&apos;s.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-auto">
                        <CodeSurface
                            value={value}
                            onChange={onChange}
                            label={`${label}, expanded`}
                            placeholder={placeholder}
                            minHeight="100%"
                            className="h-full"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
