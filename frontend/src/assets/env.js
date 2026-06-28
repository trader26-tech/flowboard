// Runtime API location. Same-origin "/api" works for the single-service deploy
// (FastAPI serves this app) and for local dev (the Angular proxy forwards /api).
// Only change this if you host the API on a different domain.
window.__APP_CONFIG__ = {
  apiUrl: "/api"
};
