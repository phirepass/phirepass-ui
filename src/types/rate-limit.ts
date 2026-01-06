export interface RateLimitConfig {
  id: string;
  tunnelId: string;
  enabled: boolean;
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  blockDuration: number; // seconds
  whitelistedIps: string[];
  blacklistedIps: string[];
  customRules: RateLimitRule[];
}

export interface RateLimitRule {
  id: string;
  name: string;
  path: string;
  method?: string;
  requestsPerMinute: number;
  enabled: boolean;
}

export interface RateLimitStats {
  totalBlocked: number;
  blockedToday: number;
  topBlockedIps: { ip: string; count: number }[];
  requestsThrottled: number;
}
