'use client';

import { notFound } from 'next/navigation';

import { PipelineEditorPage } from '@/components/pipelines/PipelineEditorPage';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/** The editor with nothing loaded into it. Gated exactly like the list. */
export default function Page() {
    if (!useDevSurfaceVisible()) {
        notFound();
    }

    return <PipelineEditorPage pipeline={null} />;
}
