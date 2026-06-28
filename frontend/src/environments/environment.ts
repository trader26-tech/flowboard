declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

// Default to same-origin "/api": in production FastAPI serves the SPA and the API
// together; in dev the Angular proxy forwards /api to the backend. Override via
// window.__APP_CONFIG__.apiUrl (assets/env.js) only if the API lives elsewhere.
export const environment = {
  production: false,
  apiUrl: window.__APP_CONFIG__?.apiUrl ?? '/api',
};
