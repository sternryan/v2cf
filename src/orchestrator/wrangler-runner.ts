import { execa } from 'execa';

interface WranglerRunnerOptions {
  cwd: string;
  env?: Record<string, string>;
}

export class WranglerRunner {
  constructor(private options: WranglerRunnerOptions) {}

  private get execaOptions() {
    return {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
    };
  }

  /** Validate wrangler auth and return account ID. */
  async getAccountId(): Promise<string> {
    const result = await execa(
      'npx',
      ['wrangler', 'whoami'],
      { ...this.execaOptions, stdio: 'pipe' }
    );
    // Parse account ID from table output: │ Account Name │ Account ID │
    const match = result.stdout.match(
      /│\s+[^│]+│\s+([a-f0-9]{32})\s+│/
    );
    if (!match) {
      throw new Error(
        'Could not determine Cloudflare account ID.\n' +
          'Run `wrangler login` or set CLOUDFLARE_API_TOKEN.\n' +
          'See: https://developers.cloudflare.com/workers/wrangler/commands/#login'
      );
    }
    return match[1];
  }

  /** Create a D1 database and return its UUID. */
  async d1Create(name: string): Promise<{ uuid: string; name: string }> {
    const result = await execa(
      'npx',
      ['wrangler', 'd1', 'create', name],
      { ...this.execaOptions, stdio: 'pipe' }
    );
    // wrangler d1 create outputs: Created D1 database 'name'
    // followed by a toml block: database_id = "uuid"
    const uuidMatch = result.stdout.match(
      /database_id\s*=\s*"([a-f0-9-]+)"/
    );
    if (!uuidMatch) {
      throw new Error(
        `D1 database creation succeeded but could not parse UUID from output:\n${result.stdout}`
      );
    }
    return { uuid: uuidMatch[1], name };
  }

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
      { ...this.execaOptions, stdio: 'inherit' }
    );
  }

  async secretBulk(secretsFile: string): Promise<void> {
    await execa(
      'npx',
      ['wrangler', 'secret', 'bulk', secretsFile],
      { ...this.execaOptions, stdio: 'inherit' }
    );
  }

  async deploy(): Promise<string> {
    const result = await execa(
      'npx',
      ['opennextjs-cloudflare', 'deploy'],
      { ...this.execaOptions, stdio: 'inherit' }
    );
    return result.stdout;
  }

  async build(): Promise<void> {
    await execa(
      'npx',
      ['opennextjs-cloudflare', 'build'],
      { ...this.execaOptions, stdio: 'inherit' }
    );
  }
}
