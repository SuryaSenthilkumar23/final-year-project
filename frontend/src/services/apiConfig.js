export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000')
export const ENDPOINTS = {
  investigation: '/api/investigation',
  upload: '/api/upload',
  artifacts: '/api/artifacts',
  entities: '/api/entities',
  graph: '/api/correlation-graph',
  reports: '/api/reports'
}
