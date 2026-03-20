# CLAUDE.md

## Project Overview

v2cf is a TypeScript CLI that migrates Next.js projects from Vercel to Cloudflare Workers. It analyzes Vercel-specific code patterns, applies AST-level transforms via ts-morph, provisions Cloudflare infrastructure via wrangler CLI, and validates behavioral parity through session replay.

## Quick Start

```bash
npm install           # Install dependencies
npm test              # Run 395 tests (vitest)
npm run dev -- analyze ./path/to/project  # Run CLI in dev mode
```

## Architecture

```
src/
  analyzer/       # Pattern detection: 4 scanners (dependency, import, pattern, streaming)
  transformer/    # AST transforms: 6 rules + KV-to-D1 rewriter (ts-morph)
  orchestrator/   # Deploy pipeline: config gen, D1, secrets, wrangler deploy
  sync/           # Auto-sync: Vercel webhook + CF Worker receiver
  mirror/         # Replay: rrweb capture, Playwright replay, behavioral diff
  commands/       # CLI: analyze, transform, deploy, go, sync, replay
  schemas/        # Zod schemas: ProjectModel, DetectedPattern, confidence tiers
  report/         # Output: terminal formatter, JSON writer
tests/            # Vitest tests mirroring src/ structure
fixtures/         # stripped project fixtures for integration tests
```

## Key Patterns

- **Scanner pattern**: Each analyzer scanner implements `scan(project, model)` returning `DetectedPattern[]`
- **TransformRule pattern**: Each transform has `id`, `appliesTo: string[]`, `transform(sourceFile, pattern, context)`
- **Pipeline pattern**: `applyTransforms(model, options)` runs all registered transforms in order
- **Config gen pattern**: Pure functions returning file content strings (`generateOpenNextConfig()`, etc.)
- **WranglerRunner**: Wraps all wrangler CLI calls via execa with consistent cwd/env handling

## Testing

- Framework: vitest
- Convention: `tests/` mirrors `src/` structure
- Fixtures: `tests/fixtures/stripped/` contains real app fixture files
- Run: `npm test` or `npx vitest run`
- All tests are unit tests with mocked external calls (no live API calls in CI)

## CLI Commands

| Command | What it does |
|---------|-------------|
| `v2cf analyze <dir>` | Detect Vercel patterns, output report |
| `v2cf transform <dir>` | Apply AST transforms to source files |
| `v2cf deploy <dir>` | Generate config, provision infra, deploy |
| `v2cf go <dir>` | Full pipeline: analyze + transform + deploy + sync |
| `v2cf sync enable/disable/status` | Manage Vercel webhook auto-sync |
| `v2cf replay capture/run/sessions` | Mirror/replay validation system |

## External Dependencies

- **wrangler**: All Cloudflare operations (D1 create, deploy, secrets) go through wrangler CLI
- **OpenNext**: `@opennextjs/cloudflare` for Next.js-to-Workers build
- **ts-morph**: AST parsing and transforms (no string regex)
- **Playwright**: Headless browser for replay validation
- **rrweb**: DOM interaction recording

## Conventions

- Transforms must be idempotent (running twice produces same result)
- Generated files include `/* eslint-disable */` + `// @ts-nocheck` for target project compat
- Config generators are pure functions (no side effects, easy to test)
- Pipeline ordering: D1 create before wrangler.jsonc (real DB ID), npm install before build, commit before migration
- `--legacy-peer-deps` used for npm install in target projects (Next.js 14 peer dep conflicts)
