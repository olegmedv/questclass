import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RESET_PASSWORD_USAGE, resetPasswordCommand } from './resetPassword';

/** Process boundary of the CLI, injectable for tests. */
export interface CliIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  stdout(line: string): void;
  stderr(line: string): void;
  /** Piped stdin as text, or null when stdin is an interactive terminal. */
  readStdin(): Promise<string | null>;
}

type Command = (args: readonly string[], io: CliIo) => Promise<number>;

/** Server-side maintenance commands. Each module adds its line here. */
const COMMANDS: Readonly<Record<string, { run: Command; usage: string }>> = {
  'reset-password': { run: resetPasswordCommand, usage: RESET_PASSWORD_USAGE },
};

function usage(): string {
  const lines = Object.values(COMMANDS).map((c) => `  ${c.usage}`);
  return ['Usage: node dist/cli.js <command>', '', 'Commands:', ...lines].join('\n');
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : COMMANDS[name];
  if (!command) {
    io.stderr(name === undefined ? usage() : `Unknown command: ${name}\n\n${usage()}`);
    return 2;
  }
  return command.run(args, io);
}

async function readProcessStdin(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isEntryPoint(): boolean {
  const script = process.argv[1];
  return script !== undefined && pathToFileURL(realpathSync(script)).href === import.meta.url;
}

if (isEntryPoint()) {
  const io: CliIo = {
    env: process.env,
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    readStdin: readProcessStdin,
  };
  runCli(process.argv.slice(2), io).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
