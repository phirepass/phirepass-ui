'use client';

import { useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';

import { PipelineEditorPage } from '@/components/pipelines/PipelineEditorPage';
import { usePipeline, useStoreReady } from '@/components/pipelines/pipeline-store';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';

export const dynamic = 'force-dynamic';

/**
 * The editor loaded with an existing pipeline.
 *
 * The store seeds itself on the client, so a direct hit on this URL renders
 * before there is anything to find. That is a wait, not a 404 — the redirect
 * fires only once the store is populated and the id is genuinely not in it,
 * which is what a hard reload does to a pipeline created in another tab.
 */
export default function Page() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const visible = useDevSurfaceVisible();
    const ready = useStoreReady();
    const pipeline = usePipeline(params?.id ?? null);

    useEffect(() => {
        if (visible && ready && !pipeline) router.replace('/dashboard/pipelines');
    }, [visible, ready, pipeline, router]);

    if (!visible) {
        notFound();
    }

    if (!pipeline) {
        return (
            <div className="container mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
                Loading pipeline...
            </div>
        );
    }

    return <PipelineEditorPage pipeline={pipeline} />;
}
