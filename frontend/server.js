// Minimal static server for the built Angular app with SPA fallback.
// Used on Railway: `npm run build` then `npm run serve:prod`.
const express = require('express');
const path = require('path');

const app = express();
const dist = path.join(__dirname, 'dist', 'flowboard', 'browser');
const port = process.env.PORT || 8080;

app.use(express.static(dist, { maxAge: '1h', index: false }));

// SPA fallback — send index.html for any non-file route.
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, () => console.log(`FlowBoard frontend listening on :${port}`));
