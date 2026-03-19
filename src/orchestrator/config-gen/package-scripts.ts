export function generatePackageScriptUpdates(): {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return {
    scripts: {
      preview:
        'opennextjs-cloudflare build && opennextjs-cloudflare preview',
      deploy:
        'opennextjs-cloudflare build && opennextjs-cloudflare deploy',
      'cf-typegen':
        'wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts',
    },
    devDependencies: {
      '@opennextjs/cloudflare': '^1.17.1',
      wrangler: '^4.75.0',
    },
  };
}
