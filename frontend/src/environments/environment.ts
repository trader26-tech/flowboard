declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

export const environment = {
  production: false,
  apiUrl: window.__APP_CONFIG__?.apiUrl ?? 'http://localhost:8000/api',
};
