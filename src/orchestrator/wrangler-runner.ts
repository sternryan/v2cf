import { execa } from 'execa';

interface WranglerRunnerOptions {
  cwd: string;
  env?: Record<string, string>;
}

export class WranglerRunner {
  constructor(private options: WranglerRunnerOptions) {}

  async d1Execute(databaseName: string, sqlFile: string): Promise<void> {
    await execa(
      'npx',
      [
        'wrangler',
        'd1',
        'execute',
        databaseName,
        '--file',
        sqlFile,
        '--remote',
        '--yes',
      ],
      {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: 'inherit',
      }
    );
  }

  async secretBulk(secretsFile: string): Promise<void> {
    await execa(
      'npx',
      ['wrangler', 'secret', 'bulk', secretsFile],
      {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: 'inherit',
      }
    );
  }

  async deploy(): Promise<string> {
    const result = await execa(
      'npx',
      ['opennextjs-cloudflare', 'deploy'],
      {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: 'inherit',
      }
    );
    return result.stdout;
  }

  async build(): Promise<void> {
    await execa(
      'npx',
      ['opennextjs-cloudflare', 'build'],
      {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: 'inherit',
      }
    );
  }
}
