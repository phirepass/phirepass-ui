import { ApiKey } from '@/types/api-key';

export const mockApiKeys: ApiKey[] = [
  {
    id: 'key-1',
    name: 'Production CI/CD',
    key: 'pp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    prefix: 'pp_live_',
    createdAt: new Date(Date.now() - 86400000 * 30),
    lastUsedAt: new Date(Date.now() - 3600000),
    scopes: ['tunnels:read', 'tunnels:write', 'nodes:read'],
    status: 'active',
  },
  {
    id: 'key-2',
    name: 'Development Testing',
    key: 'pp_test_yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
    prefix: 'pp_test_',
    createdAt: new Date(Date.now() - 86400000 * 15),
    lastUsedAt: new Date(Date.now() - 86400000 * 2),
    scopes: ['api:full'],
    status: 'active',
  },
  {
    id: 'key-3',
    name: 'Old Integration',
    key: 'pp_live_zzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'pp_live_',
    createdAt: new Date(Date.now() - 86400000 * 90),
    lastUsedAt: new Date(Date.now() - 86400000 * 45),
    expiresAt: new Date(Date.now() - 86400000 * 10),
    scopes: ['logs:read'],
    status: 'revoked',
  },
];

export const generateApiKey = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
};
