export interface WebhookRequest {
  id: string;
  tunnelId: string;
  tunnelName: string;
  timestamp: Date;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  fullUrl: string;
  statusCode: number;
  duration: number;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  requestBodyType?: 'json' | 'form' | 'xml' | 'text' | 'binary';
  responseHeaders: Record<string, string>;
  responseBody?: string;
  responseBodyType?: 'json' | 'html' | 'xml' | 'text' | 'binary';
  clientIp: string;
  userAgent: string;
  contentLength: number;
  isReplayed?: boolean;
  originalRequestId?: string;
}

export interface ReplayResult {
  success: boolean;
  statusCode: number;
  duration: number;
  responseBody?: string;
  error?: string;
}
