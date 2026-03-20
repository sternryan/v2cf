# AGENTS.md

Instructions for AI coding assistants working on this project (ChatGPT, Copilot, Gemini, Cursor, etc.).

## Project Summary

v2cf is a TypeScript CLI tool that migrates Next.js projects from Vercel to Cloudflare Workers. It uses AST-level code transforms (not regex), provisions Cloudflare infrastructure, and validates behavioral parity through session replay.

## Getting Started

```bash
npm install           # Install dependencies
npm test              # Run tests (vitest, 395 tests)
npm run dev -- <command> <args>  # Run CLI in development
```

## Source Structure

- `src/analyzer/` -- Scans for Vercel-specific patterns (4 scanners)
- `src/transformer/` -- AST transforms via ts-morph (6 transform rules + KV-to-D1)
- `src/orchestrator/` -- Cloudflare deploy pipeline (config gen, D1, secrets, wrangler)
- `src/sync/` -- Auto-sync via Vercel webhooks + CF Worker receiver
- `src/mirror/` -- Session capture (rrweb), Playwright replay, behavioral diff
- `src/commands/` -- CLI command handlers (analyze, transform, deploy, go, sync, replay)
- `src/schemas/` -- Zod validation schemas
- `tests/` -- Mirrors src/ structure, vitest

## Important Conventions

1. **AST transforms only** -- Use ts-morph for code modifications, never string regex
2. **Transforms must be idempotent** -- Running twice produces the same result
3. **Test alongside implementation** -- Tests mirror src/ directory structure
4. **Pure config generators** -- Config generation functions have no side effects
5. **Wrangler CLI for all Cloudflare ops** -- No direct Cloudflare SDK; all operations go through wrangler
6. **Generated files need escape hatches** -- Files generated in target projects include `/* eslint-disable */` and `// @ts-nocheck`

## Key Types

- `ProjectModel` (src/schemas/project-model.ts) -- Analysis output with detected patterns
- `DetectedPattern` -- Individual Vercel pattern with type, confidence tier, location
- `TransformRule` (src/transformer/types.ts) -- Interface for AST transform plugins
- `DeployConfig` / `DeployResult` (src/orchestrator/types.ts) -- Deploy pipeline I/O
- `CaptureSession` / `ReplayResult` (src/mirror/) -- Replay system types

## Testing

```bash
npm test                          # Full suite (395 tests)
npx vitest run tests/analyzer/   # Run specific directory
npx vitest run -t "pattern"      # Run tests matching name
```

Test fixtures are in `tests/fixtures/stripped/` -- a real Next.js app structure.

## CLI Reference

```bash
v2cf analyze <dir>              # Detect Vercel patterns
v2cf transform <dir>            # Apply code transforms
v2cf deploy <dir>               # Deploy to Cloudflare
v2cf go <dir>                   # Full pipeline (analyze+transform+deploy+sync)
v2cf sync enable|disable|status # Manage auto-sync
v2cf replay capture|run|sessions # Mirror validation
```

## External Services

- **Cloudflare**: Authenticated via `wrangler login` (OAuth) or `CLOUDFLARE_API_TOKEN`
- **Vercel**: `VERCEL_TOKEN` env var for webhook sync features
- **OpenNext**: `@opennextjs/cloudflare` handles Next.js-to-Workers build

## Common Tasks

**Adding a new transform:**
1. Create `src/transformer/transforms/my-transform.ts` implementing `TransformRule`
2. Register in `src/transformer/transforms/index.ts`
3. Add scanner pattern type in `src/analyzer/` if needed
4. Add tests in `tests/transformer/my-transform.test.ts`

**Adding a CLI command:**
1. Create `src/commands/my-command.ts` with `registerMyCommand(program)`
2. Wire in `src/cli.ts`
3. Add tests in `tests/commands/` or relevant test directory
