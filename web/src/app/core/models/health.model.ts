export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  env: string;
  time: string;
  checks: {
    database: boolean;
  };
}
