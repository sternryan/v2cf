import { describe, it, expect, vi } from 'vitest';
import { WranglerRunner } from '../../src/orchestrator/wrangler-runner.js';
import { buildAndDeploy } from '../../src/orchestrator/infra/deployer.js';

describe('deployer', () => {
  it('calls runner.build() then runner.deploy() in sequence', async () => {
    const callOrder: string[] = [];
    const mockRunner = {
      build: vi.fn().mockImplementation(async () => {
        callOrder.push('build');
      }),
      deploy: vi.fn().mockImplementation(async () => {
        callOrder.push('deploy');
        return 'deploy-output-url';
      }),
    } as unknown as WranglerRunner;

    await buildAndDeploy(mockRunner);

    expect(callOrder).toEqual(['build', 'deploy']);
  });

  it('returns stdout from deploy', async () => {
    const mockRunner = {
      build: vi.fn().mockResolvedValue(undefined),
      deploy: vi.fn().mockResolvedValue('https://my-worker.workers.dev'),
    } as unknown as WranglerRunner;

    const result = await buildAndDeploy(mockRunner);
    expect(result).toBe('https://my-worker.workers.dev');
  });
});
