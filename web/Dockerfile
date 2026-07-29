# syntax=docker/dockerfile:1
#
# Runs as a live `vite preview` server rather than static files served by
# nginx: the app's vite.config.ts server-renders Open Graph tags for
# /share/:token links (so WhatsApp/iMessage previews show the look's name and
# snapshot image) via a configurePreviewServer hook — that only runs when vite
# itself is serving, not for plain static files. Needs the full node_modules
# (not a pruned/deploy one) since `vite preview` itself must run at runtime.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# vite.config.ts throws if PORT/BASE_PATH are unset, even at build time.
ENV PORT=5173
ENV BASE_PATH=/
RUN pnpm --filter @workspace/style-studio run build

ENV NODE_ENV=production
EXPOSE 5173
CMD ["pnpm", "--filter", "@workspace/style-studio", "run", "serve"]
