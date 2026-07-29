import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

/**
 * Serves the SPA shell for /share/:token with Open Graph meta tags rendered
 * server-side, so chat apps (WhatsApp/iMessage/etc.) unfurl share links with
 * the look's name and snapshot image instead of generic app metadata.
 */
const SHARE_PATH_RE = /^\/share\/([A-Za-z0-9_-]+)\/?$/;
// Internal origin of the shared workspace proxy that fronts all artifacts.
const API_ORIGIN = process.env.SHARE_OG_API_ORIGIN || 'http://127.0.0.1:80';

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function injectShareOgTags(
  html: string,
  look: { name: string; hasSnapshot: boolean },
  token: string,
  req: IncomingMessage,
): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
    'https';
  const host =
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ||
    req.headers.host ||
    '';
  const title = escapeHtml(`${look.name} — Style Studio`);
  const description = escapeHtml(
    `Check out this saved look "${look.name}" on Style Studio.`,
  );
  const imageUrl = `${proto}://${host}/api/share/${token}/snapshot.jpg`;

  // Strip the generic tags so crawlers see only the look-specific ones.
  let out = html
    .replace(/[ \t]*<meta (?:property="og:|name="twitter:)[^>]*>[ \t]*\n?/g, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${description}$2`,
    );

  const ogTags = [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${proto}://${host}/share/${token}" />`,
    ...(look.hasSnapshot
      ? [
          `<meta property="og:image" content="${imageUrl}" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:image" content="${imageUrl}" />`,
        ]
      : [`<meta name="twitter:card" content="summary" />`]),
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ].join('\n    ');

  return out.replace('</head>', `    ${ogTags}\n  </head>`);
}

function shareOgMiddleware(getHtml: (url: string) => Promise<string>) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    try {
      if (req.method !== 'GET') return next();
      const url = (req.url || '').split('?')[0];
      const match = SHARE_PATH_RE.exec(url);
      if (!match) return next();
      const accept = req.headers.accept || '';
      if (accept && !accept.includes('text/html') && !accept.includes('*/*'))
        return next();
      const token = match[1];

      const apiRes = await fetch(`${API_ORIGIN}/api/share/${token}`);
      if (!apiRes.ok) return next();
      const look = (await apiRes.json()) as {
        name?: string;
        snapshotDataUrl?: string | null;
      };
      if (!look?.name) return next();

      const html = injectShareOgTags(
        await getHtml(req.url || url),
        { name: look.name, hasSnapshot: !!look.snapshotDataUrl },
        token,
        req,
      );
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    } catch {
      next();
    }
  };
}

function shareOgPlugin() {
  return {
    name: 'share-og-tags',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(
        shareOgMiddleware(async (url) => {
          const raw = fs.readFileSync(
            path.resolve(import.meta.dirname, 'index.html'),
            'utf-8',
          );
          return server.transformIndexHtml(url, raw);
        }),
      );
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use(
        shareOgMiddleware(async () =>
          fs.readFileSync(
            path.resolve(import.meta.dirname, 'dist/public/index.html'),
            'utf-8',
          ),
        ),
      );
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    shareOgPlugin(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
