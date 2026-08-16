/**
 * The support contact form's shared vocabulary — imported by both the dialog
 * and the API route so the select's options and the server's allow-list cannot
 * drift apart.
 */

export const CONTACT_TOPICS = [
    'general',
    'technical',
    'billing',
    'security',
    'feedback',
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
    general: 'General question',
    technical: 'Technical issue',
    billing: 'Billing & account',
    security: 'Security report',
    feedback: 'Product feedback',
};
