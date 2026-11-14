// Development and preview only: in production Node answers /assets/* itself, with the admin's
// replacements («Оформление», FEAT-059). Here Vite serves public/assets, so a file the admin
// replaced is fetched from the API (`/api/appearance/files/<file>`) instead; every other file
// stays Vite's. The list of replaced files is re-read at most every 0.2 s; a URL with `?v=<n>`
// (the admin's «Оформление» after a change) goes to the API at once.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ProxyOptions } from 'vite';

type Next = (err?: unknown) => void;

const PREFIX = '/assets/';
const FRESH_MS = 200;

/** Where the server's `/api` proxy points: the API this server works with. */
function apiTargetOf(proxy: Record<string, string | ProxyOptions> | undefined): string | null {
  const entry = proxy?.['/api'];
  const target = typeof entry === 'string' ? entry : entry?.target;
  return typeof target === 'string' ? target : null;
}

function middlewareFor(apiTarget: string) {
  let known: { at: number; files: Set<string> } = { at: 0, files: new Set() };

  const replacedFiles = async (): Promise<Set<string>> => {
    if (Date.now() - known.at < FRESH_MS) return known.files;
    try {
      const res = await fetch(`${apiTarget}/api/appearance`);
      const body = (await res.json()) as { files?: Record<string, unknown> };
      known = { at: Date.now(), files: new Set(Object.keys(body.files ?? {})) };
    } catch {
      known = { at: Date.now(), files: new Set() }; // API not running: built-in files only
    }
    return known.files;
  };

  const middleware = (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const url = req.url ?? '';
    if (!url.startsWith(PREFIX) || (req.method !== 'GET' && req.method !== 'HEAD')) {
      next();
      return;
    }
    const [pathname = '', search = ''] = url.split('?');
    const file = decodeURIComponent(pathname.slice(PREFIX.length));
    const versioned = /(^|&)v=[1-9]/.test(search);
    void (async () => {
      if (!versioned && !(await replacedFiles()).has(file)) {
        next();
        return;
      }
      const headers: Record<string, string> = {};
      for (const name of ['range', 'if-none-match']) {
        const value = req.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      const upstream = await fetch(
        `${apiTarget}/api/appearance/files${pathname.slice(PREFIX.length - 1)}`,
        {
          method: req.method,
          headers,
        },
      );
      if (upstream.status === 404) {
        next();
        return;
      }
      res.statusCode = upstream.status;
      upstream.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    })().catch(next);
  };

  return middleware;
}

/** Takes the API address from the `/api` proxy of the dev or preview server it runs in. */
export function replacedAssets(): Plugin {
  return {
    name: 'questclass-replaced-assets',
    configureServer: (server) => {
      const target = apiTargetOf(server.config.server.proxy);
      if (target) server.middlewares.use(middlewareFor(target));
    },
    configurePreviewServer: (server) => {
      const target = apiTargetOf(server.config.preview.proxy);
      if (target) server.middlewares.use(middlewareFor(target));
    },
  };
}
