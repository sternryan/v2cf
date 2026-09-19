# v2cf

**Migrate Next.js projects from Vercel to Cloudflare Workers with one command.**

v2cf analyzes your Vercel-specific code patterns, applies AST-level transforms, provisions Cloudflare infrastructure (D1 databases, secrets, custom domains), deploys via OpenNext, and optionally keeps both deployments in sync until you're ready to flip DNS.

```bash
npx v2cf go ./my-nextjs-app --worker-name my-app-cf
```

> v2cf is published to npm. Run it directly with `npx v2cf <command>` without installing globally.

## What it does

1. **Analyze** -- Scans your codebase for Vercel-specific patterns (7 pattern types detected)
2. **Transform** -- Rewrites code at the AST level using ts-morph (not string replacement)
3. **Deploy** -- Generates Cloudflare config, creates D1 databases, runs migrations, deploys via OpenNext
4. **Sync** -- Registers a Vercel webhook that triggers Cloudflare rebuilds on every deploy
5. **Validate** -- Records user sessions on Vercel, replays on Cloudflare, produces a behavioral diff report

## Detected patterns

| Pattern | Action | Confidence |
|---------|--------|------------|
| `export const maxDuration` | Removed (CF has unlimited wall-clock I/O) | AUTO |
| `export const runtime = "edge"` | Removed (CF Workers are edge by default) | AUTO |
| `@vercel/analytics`, `@vercel/speed-insights` | Import + JSX element removed | AUTO |
| `@vercel/og` | Rewritten to `next/og` | AUTO |
| `@vercel/kv` (get/set/del/incr) | Rewritten to D1 adapter with migration SQL | AUTO |
| `@vercel/kv` (lpush/lrange) | Rewritten to D1 adapter with list table | REVIEW |
| `x-forwarded-for` header | Replaced with `getClientIp()` helper (CF-Connecting-IP fallback) | AUTO |
| `onFinish` streaming callback | Wrapped with `ctx.waitUntil()` | REVIEW |
| `fs.readFileSync` (runtime) | Flagged for manual review | MANUAL |

## Quick start

### Prerequisites

- Node.js 22+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) authenticated (`wrangler login`)
- A Next.js project deployed on Vercel

### Full pipeline

```bash
# One command does everything: analyze, transform, deploy
npx v2cf go ./my-project --worker-name my-project-cf

# With custom domain (requires CLOUDFLARE_API_TOKEN)
npx v2cf go ./my-project --worker-name my-project-cf --subdomain cf.mydomain.com
```

### Step by step

```bash
# 1. See what needs to change
npx v2cf analyze ./my-project

# 2. Apply transforms (creates a v2cf/migrate branch in your project)
npx v2cf transform ./my-project

# 3. Deploy to Cloudflare
npx v2cf deploy ./my-project --worker-name my-project-cf
```

### Auto-sync (keeps Cloudflare mirror current)

```bash
# Requires VERCEL_TOKEN (https://vercel.com/account/tokens)
export VERCEL_TOKEN=your-token

npx v2cf sync enable --project-dir ./my-project --worker-name my-project-cf
npx v2cf sync status --project-dir ./my-project
npx v2cf sync disable --project-dir ./my-project
```

### Mirror/replay validation

```bash
# 1. Generate a recorder script to paste into your Vercel site
npx v2cf replay capture --project-dir ./my-project

# 2. After recording sessions, replay against Cloudflare mirror
npx v2cf replay run --project-dir ./my-project --target https://my-project-cf.workers.dev

# 3. List recorded sessions
npx v2cf replay sessions --project-dir ./my-project
```

The replay produces an HTML diff report with a **canFlipDns** verdict -- telling you whether the Cloudflare deployment behaves identically to Vercel.

## Architecture

```
src/
  analyzer/       # Pattern detection (4 scanners, Zod schemas)
  transformer/    # AST transforms (ts-morph, 6 transform rules)
  orchestrator/   # Config generation + deploy pipeline (wrangler CLI)
  sync/           # Vercel webhook + CF Worker receiver
  mirror/         # Session capture, Playwright replay, behavioral diff
  commands/       # CLI command handlers
  schemas/        # Shared Zod schemas (ProjectModel, patterns)
  report/         # Terminal + JSON report formatters
```

## How it works

**Transform phase:** v2cf uses [ts-morph](https://ts-morph.com/) to parse your TypeScript/TSX files into an AST, detect Vercel-specific patterns, and rewrite them for Cloudflare compatibility. No regex string replacement -- all transforms are structure-aware.

**Deploy phase:** Uses [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) to build and deploy. Infrastructure provisioned via `wrangler` CLI (D1 databases, secrets, custom domains). All changes committed to a `v2cf/migrate` branch so you can review the diff.

**Sync phase:** Deploys a lightweight Cloudflare Worker as a webhook receiver. When Vercel deploys, the Worker verifies the HMAC-SHA1 signature and triggers a GitHub `repository_dispatch` to rebuild the Cloudflare deployment.

**Replay phase:** Uses [rrweb](https://github.com/rrweb-io/rrweb) for DOM interaction recording and [Playwright](https://playwright.dev/) for headless replay. LLM API calls are captured with `response.clone()` and injected during replay via `page.route()` for deterministic comparison.

## Authentication

| What | How | Required for |
|------|-----|-------------|
| Cloudflare (core) | `wrangler login` (OAuth) | analyze, transform, deploy |
| Cloudflare (custom domains) | `CLOUDFLARE_API_TOKEN` env var | `--subdomain` flag |
| Vercel (sync) | `VERCEL_TOKEN` env var | sync enable/disable |

## Compatibility

- **Next.js**: 14.x and 15.x (uses `--dangerouslyUseUnsupportedNextVersion` for 14.x)
- **Runtime**: OpenNext for Cloudflare (@opennextjs/cloudflare)
- **Node.js**: 22+

## Development

```bash
git clone https://github.com/sternryan/v2cf.git
cd v2cf
npm install
npm test          # 395 tests
npm run dev -- analyze ./path/to/project
```

## License

MIT
