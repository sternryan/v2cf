export interface SyncWorkflowConfig {
  workerName: string;
}

/**
 * Generate a GitHub Actions workflow YAML for v2cf sync.
 *
 * The workflow triggers on:
 * - repository_dispatch with type 'v2cf-sync' (from the webhook Worker)
 * - push to main (manual fallback)
 *
 * It checks out the repo, installs Node.js 22, installs dependencies,
 * and runs `npx v2cf deploy` to rebuild the Cloudflare Worker.
 */
export function generateSyncWorkflow(config: SyncWorkflowConfig): string {
  return `name: v2cf-sync

on:
  repository_dispatch:
    types: [v2cf-sync]
  push:
    branches:
      - main

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Cloudflare
        run: npx v2cf deploy . --worker-name ${config.workerName}
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`;
}
