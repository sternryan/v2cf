import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

vi.mock('fs');
vi.mock('consola', () => ({
  default: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    start: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock infra modules
vi.mock('../../src/orchestrator/infra/d1-provisioner.js', () => ({
  createD1Database: vi.fn(),
  runMigration: vi.fn(),
}));

vi.mock('../../src/orchestrator/infra/secret-pusher.js', () => ({
  pushSecrets: vi.fn(),
}));

vi.mock('../../src/orchestrator/infra/deployer.js', () => ({
  buildAndDeploy: vi.fn(),
}));

vi.mock('../../src/orchestrator/infra/domain-configurator.js', () => ({
  resolveZone: vi.fn(),
  configureDomain: vi.fn(),
  isDomainConfigAvailable: vi.fn(),
}));

vi.mock('../../src/orchestrator/git-branch.js', () => ({
  createMigrationBranch: vi.fn(),
  commitChanges: vi.fn(),
}));

vi.mock('../../src/orchestrator/wrangler-runner.js', () => {
  class MockWranglerRunner {
    constructor(public options: Record<string, unknown>) {}
    getAccountId = vi.fn().mockResolvedValue('acc-123');
  }
  return { WranglerRunner: MockWranglerRunner };
});

vi.mock('../../src/orchestrator/config-gen/opennext-config.js', () => ({
  generateOpenNextConfig: vi.fn(),
}));

vi.mock('../../src/orchestrator/config-gen/wrangler-config.js', () => ({
  generateWranglerConfig: vi.fn(),
}));

vi.mock('../../src/orchestrator/config-gen/package-scripts.js', () => ({
  generatePackageScriptUpdates: vi.fn(),
}));

vi.mock('../../src/orchestrator/config-gen/env-mapper.js', () => ({
  mapEnvToSecrets: vi.fn(),
}));

import { execa } from 'execa';
import { runDeployPipeline } from '../../src/orchestrator/index.js';
import { createD1Database, runMigration } from '../../src/orchestrator/infra/d1-provisioner.js';
import { pushSecrets } from '../../src/orchestrator/infra/secret-pusher.js';
import { buildAndDeploy } from '../../src/orchestrator/infra/deployer.js';
import { resolveZone, configureDomain, isDomainConfigAvailable } from '../../src/orchestrator/infra/domain-configurator.js';
import { createMigrationBranch, commitChanges } from '../../src/orchestrator/git-branch.js';
import { generateOpenNextConfig } from '../../src/orchestrator/config-gen/opennext-config.js';
import { generateWranglerConfig } from '../../src/orchestrator/config-gen/wrangler-config.js';
import { generatePackageScriptUpdates } from '../../src/orchestrator/config-gen/package-scripts.js';
import { mapEnvToSecrets } from '../../src/orchestrator/config-gen/env-mapper.js';

const mockedExeca = vi.mocked(execa);

describe('deployment pipeline orchestrator', () => {
  const projectDir = '/test/project';
  const workerName = 'my-worker';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup
    vi.mocked(createD1Database).mockResolvedValue({
      uuid: 'db-uuid-456',
      name: 'my-worker-db',
    });
    vi.mocked(generateOpenNextConfig).mockReturnValue('// open-next config');
    vi.mocked(generateWranglerConfig).mockReturnValue('// wrangler config');
    vi.mocked(generatePackageScriptUpdates).mockReturnValue({
      scripts: { deploy: 'opennextjs-cloudflare deploy' },
      devDependencies: { '@opennextjs/cloudflare': '^1.17.1', wrangler: '^4.75.0' },
    });
    vi.mocked(mapEnvToSecrets).mockReturnValue({
      secrets: { API_KEY: 'key-123' },
      plainVars: {},
      skipped: [],
    });
    vi.mocked(buildAndDeploy).mockResolvedValue('https://my-worker.workers.dev');
    vi.mocked(pushSecrets).mockResolvedValue(1);
    vi.mocked(createMigrationBranch).mockResolvedValue('v2cf/migrate');
    vi.mocked(commitChanges).mockResolvedValue(undefined);
    vi.mocked(runMigration).mockResolvedValue(undefined);
    vi.mocked(isDomainConfigAvailable).mockReturnValue(true);
    vi.mocked(resolveZone).mockResolvedValue({
      zoneId: 'zone-abc',
      zoneName: 'quartermint.com',
    });
    vi.mocked(configureDomain).mockResolvedValue(undefined);

    // Mock fs
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    // Mock execa for npm install
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);
  });

  it('calls steps in correct order: createD1 -> configs -> npm install -> git branch+commit -> migration -> deploy -> secrets -> domain', async () => {
    const callOrder: string[] = [];

    vi.mocked(createD1Database).mockImplementation(async () => {
      callOrder.push('createD1');
      return { uuid: 'db-uuid-456', name: 'my-worker-db' };
    });
    vi.mocked(fs.writeFileSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('open-next')) callOrder.push('write-opennext');
      if (typeof p === 'string' && p.includes('wrangler')) callOrder.push('write-wrangler');
      if (typeof p === 'string' && p.includes('package.json')) callOrder.push('write-package');
    });
    mockedExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'npm' && args?.[0] === 'install') callOrder.push('npm-install');
      return { stdout: '', stderr: '' } as any;
    });
    vi.mocked(createMigrationBranch).mockImplementation(async () => {
      callOrder.push('git-branch');
      return 'v2cf/migrate';
    });
    vi.mocked(commitChanges).mockImplementation(async () => {
      callOrder.push('git-commit');
    });
    vi.mocked(runMigration).mockImplementation(async () => {
      callOrder.push('run-migration');
    });
    vi.mocked(buildAndDeploy).mockImplementation(async () => {
      callOrder.push('build-deploy');
      return 'https://my-worker.workers.dev';
    });
    vi.mocked(pushSecrets).mockImplementation(async () => {
      callOrder.push('push-secrets');
      return 1;
    });
    vi.mocked(resolveZone).mockImplementation(async () => {
      callOrder.push('resolve-zone');
      return { zoneId: 'zone-abc', zoneName: 'quartermint.com' };
    });
    vi.mocked(configureDomain).mockImplementation(async () => {
      callOrder.push('configure-domain');
    });

    // Provide .env
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.env')) return true;
      if (typeof p === 'string' && p.includes('.gitignore')) return false;
      if (typeof p === 'string' && p.includes('migrations')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('package.json')) return '{}';
      if (typeof p === 'string' && p.includes('.env')) return 'API_KEY=key-123';
      if (typeof p === 'string' && p.includes('.gitignore')) return '';
      return '';
    });

    await runDeployPipeline({
      projectDir,
      workerName,
      subdomain: 'cf.quartermint.com',
    });

    // Verify ordering
    expect(callOrder.indexOf('createD1')).toBeLessThan(callOrder.indexOf('write-wrangler'));
    expect(callOrder.indexOf('write-wrangler')).toBeLessThan(callOrder.indexOf('npm-install'));
    expect(callOrder.indexOf('npm-install')).toBeLessThan(callOrder.indexOf('git-branch'));
    expect(callOrder.indexOf('git-branch')).toBeLessThan(callOrder.indexOf('git-commit'));
    expect(callOrder.indexOf('git-commit')).toBeLessThan(callOrder.indexOf('run-migration'));
    expect(callOrder.indexOf('run-migration')).toBeLessThan(callOrder.indexOf('build-deploy'));
    expect(callOrder.indexOf('build-deploy')).toBeLessThan(callOrder.indexOf('push-secrets'));
    expect(callOrder.indexOf('push-secrets')).toBeLessThan(callOrder.indexOf('resolve-zone'));
    expect(callOrder.indexOf('resolve-zone')).toBeLessThan(callOrder.indexOf('configure-domain'));
  });

  it('skips domain configuration when subdomain is not provided', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await runDeployPipeline({ projectDir, workerName });

    expect(resolveZone).not.toHaveBeenCalled();
    expect(configureDomain).not.toHaveBeenCalled();
  });

  it('skips domain config gracefully when CLOUDFLARE_API_TOKEN not set', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(isDomainConfigAvailable).mockReturnValue(false);

    const result = await runDeployPipeline({
      projectDir,
      workerName,
      subdomain: 'cf.quartermint.com',
    });

    expect(resolveZone).not.toHaveBeenCalled();
    expect(configureDomain).not.toHaveBeenCalled();
    expect(result.customDomain).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('creates D1 BEFORE generating wrangler.jsonc (so real database_id is used)', async () => {
    let d1CreatedBeforeWrangler = false;
    let d1Created = false;

    vi.mocked(createD1Database).mockImplementation(async () => {
      d1Created = true;
      return { uuid: 'db-uuid-456', name: 'my-worker-db' };
    });
    vi.mocked(generateWranglerConfig).mockImplementation(() => {
      d1CreatedBeforeWrangler = d1Created;
      return '// wrangler config';
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await runDeployPipeline({ projectDir, workerName });

    expect(d1CreatedBeforeWrangler).toBe(true);
  });

  it('creates git branch and commits AFTER file generation but BEFORE runMigration and deploy', async () => {
    const callOrder: string[] = [];

    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      callOrder.push('write-file');
    });
    vi.mocked(createMigrationBranch).mockImplementation(async () => {
      callOrder.push('git-branch');
      return 'v2cf/migrate';
    });
    vi.mocked(commitChanges).mockImplementation(async () => {
      callOrder.push('git-commit');
    });
    vi.mocked(runMigration).mockImplementation(async () => {
      callOrder.push('run-migration');
    });
    vi.mocked(buildAndDeploy).mockImplementation(async () => {
      callOrder.push('build-deploy');
      return '';
    });

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('migrations')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('{}');

    await runDeployPipeline({ projectDir, workerName });

    const lastWrite = callOrder.lastIndexOf('write-file');
    const branchIdx = callOrder.indexOf('git-branch');
    const commitIdx = callOrder.indexOf('git-commit');
    const migrationIdx = callOrder.indexOf('run-migration');
    const deployIdx = callOrder.indexOf('build-deploy');

    expect(lastWrite).toBeLessThan(branchIdx);
    expect(branchIdx).toBeLessThan(commitIdx);
    expect(commitIdx).toBeLessThan(migrationIdx);
    expect(commitIdx).toBeLessThan(deployIdx);
  });

  it('runs npm install AFTER writing package.json but BEFORE build+deploy', async () => {
    const callOrder: string[] = [];

    vi.mocked(fs.writeFileSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('package.json')) callOrder.push('write-package');
    });
    mockedExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'npm' && args?.[0] === 'install') callOrder.push('npm-install');
      return { stdout: '', stderr: '' } as any;
    });
    vi.mocked(buildAndDeploy).mockImplementation(async () => {
      callOrder.push('build-deploy');
      return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');

    await runDeployPipeline({ projectDir, workerName });

    expect(callOrder.indexOf('write-package')).toBeLessThan(callOrder.indexOf('npm-install'));
    expect(callOrder.indexOf('npm-install')).toBeLessThan(callOrder.indexOf('build-deploy'));
  });

  it('returns DeployResult with success=true, workerUrl, d1DatabaseId, secretsCount', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.env')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.env')) return 'API_KEY=key-123';
      if (typeof p === 'string' && p.includes('package.json')) return '{}';
      return '';
    });

    const result = await runDeployPipeline({
      projectDir,
      workerName,
      subdomain: 'cf.quartermint.com',
    });

    expect(result).toEqual({
      success: true,
      workerUrl: 'https://my-worker.workers.dev',
      customDomain: 'cf.quartermint.com',
      d1DatabaseId: 'db-uuid-456',
      secretsCount: 1,
    });
  });

  it('throws with descriptive error if createD1Database fails', async () => {
    vi.mocked(createD1Database).mockRejectedValue(new Error('D1 API error'));
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(
      runDeployPipeline({ projectDir, workerName })
    ).rejects.toThrow('D1');
  });

  it('writes open-next.config.ts, wrangler.jsonc, updates package.json in projectDir', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{"scripts":{"dev":"next dev"},"devDependencies":{}}');

    await runDeployPipeline({ projectDir, workerName });

    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const writtenPaths = writeCalls.map(([p]) => p as string);

    expect(writtenPaths.some((p) => p.includes('open-next.config.ts'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('wrangler.jsonc'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('package.json'))).toBe(true);
  });

  it('reads .env file from projectDir if it exists, maps to secrets', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.env')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.env')) return 'API_KEY=key-123\nDB_URL=postgres://';
      if (typeof p === 'string' && p.includes('package.json')) return '{}';
      return '';
    });

    await runDeployPipeline({ projectDir, workerName });

    expect(mapEnvToSecrets).toHaveBeenCalledWith('API_KEY=key-123\nDB_URL=postgres://');
  });
});
