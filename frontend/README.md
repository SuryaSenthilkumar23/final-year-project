# ForensiAI-X Frontend (Vite + React)

This folder contains a React frontend scaffold that consumes the existing Flask backend running on port 3000.

Run locally:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000` so no backend changes are required.

Next steps:
- Migrate pages incrementally and replace existing `index.html`/`app.js` when ready.
- Keep backend unchanged.
