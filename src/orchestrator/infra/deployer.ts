import type { WranglerRunner } from '../wrangler-runner.js';

export async function buildAndDeploy(
  runner: WranglerRunner
): Promise<string> {
  await runner.build();
  const output = await runner.deploy();
  return output;
}
