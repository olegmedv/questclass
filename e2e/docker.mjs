#!/usr/bin/env node
// Runs the e2e suite in the Linux Playwright container, exactly like CI.
//   pnpm e2e:docker [playwright args]   — check against the committed baselines
//   pnpm e2e:update [playwright args]   — same with --update-snapshots: refreshes e2e/__screenshots__
// The repository is copied into the container (host node_modules are never used there); only
// the screenshot baselines and the run output are copied back.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(repo, 'e2e/package.json'), 'utf8'));
const version = pkg.devDependencies['@playwright/test'];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`@playwright/test must be pinned to an exact version (got ${version})`);
}
const image = `questclass-e2e:${version}`;
const args = process.argv.slice(2);
const update = args.includes('--update-snapshots') || args.some((a) => a.startsWith('-u'));

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) {
    throw new Error(`${command} is not available: ${result.error.message}`);
  }
  return result.status ?? 1;
}

if (run('docker', ['info', '--format', '{{.ServerVersion}}']) !== 0) {
  console.error('Docker daemon is not running: start Docker Desktop and try again.');
  process.exit(1);
}

const built = run('docker', [
  'build',
  '--quiet',
  '--build-arg',
  `PLAYWRIGHT_VERSION=${version}`,
  '-t',
  image,
  join(repo, 'e2e'),
]);
if (built !== 0) process.exit(built);

const quoted = args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(' ');
const script = `
set -uo pipefail
mkdir -p /work
tar -C /src -cf - \\
  --exclude=node_modules --exclude=dist --exclude=.git --exclude=QuestClass-Source \\
  --exclude=./e2e/.output --exclude=.data --exclude=./ddatabase . | tar -C /work -xf -
cd /work
set -e
corepack pnpm install --frozen-lockfile --store-dir /pnpm-store --reporter=append-only > /tmp/install.log 2>&1 \\
  || { cat /tmp/install.log; exit 1; }
corepack pnpm build > /tmp/build.log 2>&1 || { cat /tmp/build.log; exit 1; }
set +e
(cd e2e && corepack pnpm exec playwright test ${quoted})
status=$?
mkdir -p /src/e2e/.output/docker
rm -rf /src/e2e/.output/docker/*
cp -r /work/e2e/.output/results /work/e2e/.output/report /src/e2e/.output/docker/ 2>/dev/null
if [ "${update ? '1' : '0'}" = "1" ] && [ -d /work/e2e/__screenshots__ ]; then
  mkdir -p /src/e2e/__screenshots__
  cp -r /work/e2e/__screenshots__/. /src/e2e/__screenshots__/
  echo "Baselines copied to e2e/__screenshots__"
fi
exit $status
`;

const status = run('docker', [
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  '-e',
  'CI=1',
  '--mount',
  `type=bind,source=${repo},target=/src`,
  '--mount',
  'type=volume,source=questclass-pnpm-store,target=/pnpm-store',
  image,
  'bash',
  '-c',
  script,
]);
process.exit(status);
