# Style Studio — Backend API

Express 5 + TypeScript API server with Drizzle ORM (PostgreSQL) and Clerk authentication.
Standalone extract of the `api-server` app plus the shared libraries it uses
(`lib/db` — database schema, `lib/api-zod` — request/response validation).

## Requirements
- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- A PostgreSQL database (local Postgres, AWS RDS, Neon, etc.)

## Setup
```bash
pnpm install
cp .env.example .env   # fill in your values, then export them (or use dotenv/direnv)
```

## Create the database schema
The schema lives in `lib/db/src/schema/` (Drizzle ORM). Push it to your database:
```bash
export DATABASE_URL=postgresql://...
pnpm --filter @workspace/db run push
```

## Run locally
```bash
pnpm --filter @workspace/api-server run dev     # builds then starts on $PORT
```
Health check: `GET http://localhost:$PORT/api/health`

## Build for production
```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build   # outputs artifacts/api-server/dist
pnpm --filter @workspace/api-server run start   # runs dist/index.mjs
```

## Tests
```bash
pnpm --filter @workspace/api-server run test
```

## Deploy on AWS (typical path)
1. Provision Postgres (RDS) and set `DATABASE_URL`.
2. Push the schema (`pnpm --filter @workspace/db run push`).
3. Run on Elastic Beanstalk / ECS / EC2 with start command:
   `pnpm --filter @workspace/api-server run start` (after `pnpm install && pnpm --filter @workspace/api-server run build`).
4. Set env vars from `.env.example` in your AWS service configuration.
5. Put it behind HTTPS (ALB/CloudFront) — the web and mobile apps call it with `Authorization: Bearer <Clerk session token>`.

## Note on object storage
Look snapshots/photos use Replit App Storage in the original environment
(`PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`). On AWS, swap the storage
client (see `artifacts/api-server/src` object-storage usage) for S3, or keep
snapshots disabled — all clothing photos are stored in the database as part of
saved looks, so core functionality works without object storage.

## Ports & inter-service communication
- API listens on `$PORT` (default 3001).
- Web + mobile apps call `https://<api-host>/api/*` with Clerk Bearer tokens.
