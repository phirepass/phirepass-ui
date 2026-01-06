import { WebhookRequest } from '@/types/webhook';

const methods: WebhookRequest['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const paths = ['/webhook/stripe', '/webhook/github', '/api/callback', '/webhook/slack', '/api/events'];

const sampleJsonBody = JSON.stringify({
  event: 'payment.completed',
  data: {
    id: 'pay_1234567890',
    amount: 2999,
    currency: 'usd',
    customer: 'cus_abcdefghij',
    metadata: { order_id: 'order_xyz' }
  },
  timestamp: new Date().toISOString()
}, null, 2);

const sampleResponseBody = JSON.stringify({
  received: true,
  processed: true,
  timestamp: new Date().toISOString()
}, null, 2);

export const mockWebhookRequests: WebhookRequest[] = Array.from({ length: 50 }, (_, i) => {
  const method = methods[Math.floor(Math.random() * methods.length)];
  const path = paths[Math.floor(Math.random() * paths.length)];
  const statusCode = Math.random() > 0.1 ? 200 : (Math.random() > 0.5 ? 400 : 500);

  return {
    id: `req-${Date.now()}-${i}`,
    tunnelId: `tun-${Math.floor(Math.random() * 4) + 1}`,
    tunnelName: ['dev-server', 'api-backend', 'webhook-test', 'staging-app'][Math.floor(Math.random() * 4)],
    timestamp: new Date(Date.now() - Math.random() * 86400000),
    method,
    path,
    fullUrl: `https://dev-server-abc123.phirepass.io${path}`,
    statusCode,
    duration: Math.floor(Math.random() * 500) + 20,
    requestHeaders: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': 'sha256=abc123def456...',
    'User-Agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)',
    'Accept': '*/*',
    'X-Request-Id': `req_${Math.random().toString(36).substr(2, 9)}`,
    },
    requestBody: method !== 'GET' ? sampleJsonBody : undefined,
    requestBodyType: method !== 'GET' ? 'json' as const : undefined,
    responseHeaders: {
    'Content-Type': 'application/json',
    'X-Request-Id': `resp_${Math.random().toString(36).substr(2, 9)}`,
    },
    responseBody: sampleResponseBody,
    responseBodyType: 'json' as const,
    clientIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    userAgent: 'Stripe/1.0 (+https://stripe.com/docs/webhooks)',
    contentLength: Math.floor(Math.random() * 5000) + 200,
    isReplayed: Math.random() > 0.9,
  };
}).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
