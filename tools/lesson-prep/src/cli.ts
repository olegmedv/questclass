// lesson-prep: prepares lessons on the admin's PC and uploads them to QuestClass.
// Commands are added by later plan items (`import` — FEAT-023, `seed` — FEAT-048).

const USAGE = 'Usage: lesson-prep <command> [options]\n\nCommands: (none yet)';

function main(argv: readonly string[]): number {
  const [command] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command}\n${USAGE}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
