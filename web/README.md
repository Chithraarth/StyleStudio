# Style Studio — Web App

React 19 + Vite web app (3D avatar try-on) with Clerk authentication.
Standalone extract of the `style-studio` app plus the shared `lib/api-client-react`
library (generated typed API hooks).

## Requirements
- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- The Style Studio backend API running somewhere reachable

## Setup
```bash
pnpm install
cp .env.example .env   # fill in values, then export them (or use dotenv/direnv)
```

## Run locally
```bash
export BASE_PATH=/
export PORT=5173      # vite config requires PORT even for builds
export VITE_CLERK_PUBLISHABLE_KEY=pk_...
export PORT=5173
pnpm run typecheck   # first time only: builds shared library types
pnpm --filter @workspace/style-studio run dev
```
The app expects the backend API under the same origin at `/api/*`.
For local dev, either run the API on the same host behind a reverse proxy,
or add a Vite dev proxy in `artifacts/style-studio/vite.config.ts`:
```ts
server: { proxy: { '/api': 'http://localhost:3001' } }
```

## Build for production
```bash
export BASE_PATH=/
export PORT=5173      # vite config requires PORT even for builds
pnpm run typecheck
pnpm --filter @workspace/style-studio run build   # outputs artifacts/style-studio/dist
```

## Deploy on AWS (typical path)
1. Build as above; upload `artifacts/style-studio/dist/` to S3 + CloudFront (or AWS Amplify).
2. Route `/api/*` from the same domain to the backend (CloudFront behavior → ALB origin),
   so the app and API share an origin.
3. Set `VITE_CLERK_PUBLISHABLE_KEY` at build time (Vite inlines it).

## Ports & inter-service communication
- Dev server: `$PORT` (default 5173). Production: static files, any host.
- Calls the backend at `<same-origin>/api/*` with Clerk Bearer tokens.
