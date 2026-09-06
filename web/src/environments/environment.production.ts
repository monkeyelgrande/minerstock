// Production — Angular se sirve desde el mismo dominio que Laravel,
// así que /api resuelve directo (sin proxy).
export const environment = {
  production: true,
  apiUrl: '/api',
};
