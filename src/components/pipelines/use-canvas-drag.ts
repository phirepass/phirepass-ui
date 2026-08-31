'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DropPosition } from '@/lib/pipeline-tree';
import type { StepKind } from '@/types/pipeline';

/**
 * The drag layer behind the pipeline canvas.
 *
 * Pointer events rather than HTML5 drag-and-drop, for three reasons that all
 * matter here: HTML5 DnD does not fire at all on touch devices, so authoring a
 * pipeline would simply be impossible on a tablet; its drag image cannot be
 * styled to match the canvas; and its event stream (dragenter/dragleave
 * bubbling out of children) makes a stable drop indicator surprisingly hard.
 * Pointer events give one continuous stream from press to release, work with
 * every input, and let the drop target be chosen from geometry.
 *
 * Targets are *slots*, not steps. Once a pipeline can branch, "the gap the
 * pointer is in" is not a number — it is a container and an index, and the
 * containers are nested and side by side. Each slot registers its own rectangle
 * and the position it represents, and the drag picks the nearest one, which
 * handles nesting without the drag layer knowing the tree exists at all.
 */

export type DragPayload =
    | { type: 'palette'; kind: StepKind; label: string }
    | { type: 'step'; id: string; label: string };

/** Pixels of movement before a press is treated as a drag rather than a click. */
const DRAG_THRESHOLD = 5;

/** How close to an edge of the canvas starts auto-scrolling, and how fast. */
const EDGE_ZONE = 56;
const EDGE_SPEED = 12;

/**
 * How far from a slot the pointer may be and still snap to it.
 *
 * Without a limit the nearest slot is always *some* slot, so releasing over
 * empty canvas a long way from the flow would still insert somewhere. Beyond
 * this the drag reports no target and the drop is abandoned.
 */
const SNAP_RADIUS = 220;

interface Armed {
    payload: DragPayload;
    startX: number;
    startY: number;
    pointerId: number;
}

/**
 * Slots and the scroll container are found in the DOM by data attribute rather
 * than registered through refs.
 *
 * Refs handed back out of a hook and read while rendering are exactly what
 * React's compiler refuses, and it is right to: the value a ref holds is not
 * part of the render. Attributes cost one `querySelectorAll` per pointer move —
 * against the `getBoundingClientRect` this already does per slot, nothing — and
 * in exchange there is no registration bookkeeping to leak when a step is
 * dragged out of a branch that then unmounts.
 */
export const CANVAS_ATTRIBUTE = 'data-pipeline-canvas';
export const SLOT_ATTRIBUTE = 'data-pipeline-slot';

/** The data attributes a slot must render for the drag layer to find it. */
export function slotAttributes(key: string, position: DropPosition) {
    return {
        [SLOT_ATTRIBUTE]: key,
        'data-slot-parent': position.parentId ?? '',
        'data-slot-lane': position.lane ?? '',
        'data-slot-index': String(position.index),
    };
}

function positionFrom(element: Element): DropPosition | null {
    const index = Number(element.getAttribute('data-slot-index'));
    if (!Number.isFinite(index)) return null;

    const parent = element.getAttribute('data-slot-parent') ?? '';
    const lane = element.getAttribute('data-slot-lane') ?? '';

    return {
        parentId: parent === '' ? null : parent,
        lane: lane === 'then' || lane === 'otherwise' ? lane : null,
        index,
    };
}

export interface CanvasDrag {
    /** The drag in progress, or `null` while nothing is being dragged. */
    payload: DragPayload | null;
    /** Where the pointer is, for the floating ghost. */
    pointer: { x: number; y: number } | null;
    /** Key of the slot that would receive the drop. */
    activeSlot: string | null;
    /** Begin a potential drag; a plain click still fires normally. */
    start: (event: React.PointerEvent, payload: DragPayload) => void;
}

export function useCanvasDrag({
    onDrop,
}: {
    onDrop: (payload: DragPayload, position: DropPosition) => void;
}): CanvasDrag {
    const [payload, setPayload] = useState<DragPayload | null>(null);
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
    const [activeSlot, setActiveSlot] = useState<string | null>(null);

    const armed = useRef<Armed | null>(null);
    /**
     * Whether the press has become a drag.
     *
     * A ref, not the `payload` state, because the whole gesture can complete
     * inside a single task — a flick of the wrist, or a synthetic drag — and
     * state set during that task is not visible to the `pointerup` handler that
     * runs before React re-renders. Reading it from state dropped those
     * gestures on the floor. State still exists, but only to draw with.
     */
    const dragging = useRef(false);
    // Read by the pointerup handler, which is registered once and would
    // otherwise close over the target as it was when the drag began.
    const liveTarget = useRef<DropPosition | null>(null);

    const reset = useCallback(() => {
        armed.current = null;
        dragging.current = false;
        liveTarget.current = null;
        setPayload(null);
        setPointer(null);
        setActiveSlot(null);
    }, []);

    const start = useCallback((event: React.PointerEvent, next: DragPayload) => {
        // Secondary buttons open menus; they are not drags.
        if (event.button !== 0) return;

        armed.current = {
            payload: next,
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
        };
    }, []);

    useEffect(() => {
        const move = (event: PointerEvent) => {
            const current = armed.current;
            if (!current || event.pointerId !== current.pointerId) return;

            const travelled = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
            if (!dragging.current && travelled < DRAG_THRESHOLD) return;

            // Past the threshold this is a drag, so suppress the text selection
            // and the scroll the same gesture would otherwise cause.
            event.preventDefault();
            if (!dragging.current) {
                dragging.current = true;
                setPayload(current.payload);
            }

            setPointer({ x: event.clientX, y: event.clientY });

            const nearest = nearestSlot(event.clientX, event.clientY);
            liveTarget.current = nearest?.position ?? null;
            setActiveSlot(nearest?.key ?? null);

            // Dragging toward an edge of a scrolled canvas has to be able to
            // reach the steps that are off screen.
            const element = document.querySelector<HTMLElement>(`[${CANVAS_ATTRIBUTE}]`);
            if (element) {
                const bounds = element.getBoundingClientRect();
                if (event.clientY < bounds.top + EDGE_ZONE) {
                    element.scrollTop -= EDGE_SPEED;
                } else if (event.clientY > bounds.bottom - EDGE_ZONE) {
                    element.scrollTop += EDGE_SPEED;
                }
            }
        };

        const up = (event: PointerEvent) => {
            const current = armed.current;
            if (!current || event.pointerId !== current.pointerId) return;

            const target = liveTarget.current;
            const wasDragging = dragging.current;
            reset();

            if (wasDragging && target) onDrop(current.payload, target);
        };

        const cancel = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !armed.current) return;
            // Abandoning the gesture must not also close the dialog behind it.
            event.stopPropagation();
            reset();
        };

        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('keydown', cancel, true);

        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            window.removeEventListener('keydown', cancel, true);
        };
    }, [onDrop, reset]);

    return { payload, pointer, activeSlot, start };
}

/**
 * The slot closest to the pointer, within reach.
 *
 * Distance is measured to the nearest point of each slot's rectangle rather
 * than to its centre, so a wide slot is "near" anywhere along its length — a
 * pointer at the far left of the canvas is next to the trunk's slots, not
 * mysteriously closer to a narrow one nested to the right.
 */
function nearestSlot(x: number, y: number): { key: string; position: DropPosition } | null {
    let best: { key: string; position: DropPosition; distance: number } | null = null;

    for (const element of document.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)) {
        const rect = element.getBoundingClientRect();
        // A slot scrolled out of its pane is not a candidate.
        if (rect.width === 0 && rect.height === 0) continue;

        const position = positionFrom(element);
        const key = element.getAttribute(SLOT_ATTRIBUTE);
        if (!position || !key) continue;

        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        const distance = Math.hypot(dx, dy);

        if (distance > SNAP_RADIUS) continue;
        if (!best || distance < best.distance) best = { key, position, distance };
    }

    return best ? { key: best.key, position: best.position } : null;
}
