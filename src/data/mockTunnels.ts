import { Tunnel, RequestLog } from '@/types/tunnel';

const generateRequestLogs = (count: number): RequestLog[] => {
  const methods: RequestLog['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const paths = ['/api/users', '/api/auth', '/api/products', '/api/orders', '/webhook', '/health', '/api/v1/data'];
  const statusCodes = [200, 201, 204, 301, 400, 401, 403, 404, 500];

  return Array.from({ length: count }, (_, i) => ({
    id: `req-${Date.now()}-${i}`,
    timestamp: new Date(Date.now() - Math.random() * 3600000),
    method: methods[Math.floor(Math.random() * methods.length)],
    path: paths[Math.floor(Math.random() * paths.length)],
    statusCode: statusCodes[Math.floor(Math.random() * statusCodes.length)],
    duration: Math.floor(Math.random() * 500) + 10,
    size: Math.floor(Math.random() * 50000) + 100,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
  })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export const mockTunnels: Tunnel[] = [
  {
    id: 'tun-1',
    name: 'dev-server',
    localPort: 3000,
    localHost: 'localhost',
    publicUrl: 'https://dev-server-abc123.phirepass.io',
    region: 'us-east-1',
    status: 'active',
    createdAt: new Date(Date.now() - 86400000 * 3),
    lastActiveAt: new Date(),
    requestCount: 1247,
    bytesIn: 15728640,
    bytesOut: 52428800,
    requestLogs: generateRequestLogs(25),
  },
  {
    id: 'tun-2',
    name: 'api-backend',
    localPort: 8080,
    localHost: 'localhost',
    publicUrl: 'https://api-backend-def456.phirepass.io',
    region: 'eu-west-1',
    status: 'active',
    createdAt: new Date(Date.now() - 86400000 * 7),
    lastActiveAt: new Date(Date.now() - 60000),
    requestCount: 8934,
    bytesIn: 104857600,
    bytesOut: 209715200,
    requestLogs: generateRequestLogs(40),
  },
  {
    id: 'tun-3',
    name: 'webhook-test',
    localPort: 4000,
    localHost: '127.0.0.1',
    publicUrl: 'https://webhook-test-ghi789.phirepass.io',
    region: 'ap-southeast-1',
    status: 'inactive',
    createdAt: new Date(Date.now() - 86400000 * 14),
    lastActiveAt: new Date(Date.now() - 86400000 * 2),
    requestCount: 456,
    bytesIn: 2097152,
    bytesOut: 5242880,
    requestLogs: generateRequestLogs(10),
  },
  {
    id: 'tun-4',
    name: 'staging-app',
    localPort: 5173,
    localHost: 'localhost',
    publicUrl: 'https://staging-app-jkl012.phirepass.io',
    region: 'us-west-2',
    status: 'inactive',
    createdAt: new Date(Date.now() - 86400000 * 30),
    lastActiveAt: new Date(Date.now() - 86400000 * 10),
    requestCount: 2341,
    bytesIn: 31457280,
    bytesOut: 62914560,
    requestLogs: generateRequestLogs(15),
  },
];
