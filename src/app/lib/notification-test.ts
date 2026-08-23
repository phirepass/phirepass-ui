import type { PushPayload } from '@/app/lib/push';

/**
 * What a test delivery says, on each channel.
 *
 * Shared by `/api/notifications/test` and the per-endpoint test so that the two
 * cannot drift: someone comparing what their phone showed against what their
 * receiver logged should be looking at the same event.
 *
 * The event id is a real one from the catalogue rather than a `test` of its
 * own, because the receiver a person is wiring up is a receiver *for* these
 * events — a body it has no branch for proves less than the body it will
 * actually get.
 */
export const TEST_EVENT = 'node.online';

export const TEST_PUSH: PushPayload = {
    title: 'Phirepass test',
    body: 'Notifications are working. This is what a node alert will look like.',
    tag: 'phirepass-test',
    url: '/dashboard/notifications',
};

/** Marked as a test in the body, so a receiver can choose not to page anyone. */
export function testWebhookPayload(): Record<string, unknown> {
    return {
        test: true,
        node: { id: '00000000-0000-0000-0000-000000000000', name: 'example-node' },
        message: 'Test delivery from the Phirepass dashboard.',
    };
}
