import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { registerShutdown } from './shutdown';
import { startup } from './startup';

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = await startup(config);
  const { app } = createApp(runtime.ctx);
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.info(`QuestClass API listening on port ${info.port}`);
  });
  registerShutdown({ server, closers: runtime.closers });
}

main().catch((err: unknown) => {
  console.error('Failed to start', err);
  process.exit(1);
});
