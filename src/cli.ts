import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerGoCommand } from './commands/go.js';
import { registerTransformCommand } from './commands/transform.js';

const program = new Command();

program
  .name('v2cf')
  .description('Convert Vercel Next.js projects to Cloudflare')
  .version('0.1.0')
  .option('--verbose', 'Enable verbose output')
  .option('--quiet', 'Suppress non-essential output')
  .option('--json', 'Output as JSON instead of terminal formatting');

registerAnalyzeCommand(program);
registerTransformCommand(program);
registerGoCommand(program);

program.parse();
