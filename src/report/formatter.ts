import chalk from 'chalk';
import type { ProjectModel, DetectedPattern } from '../schemas/project-model.js';

function getDescription(pattern: DetectedPattern): string {
  switch (pattern.type) {
    case 'vercel-kv':
      return `@vercel/kv import (${pattern.operations.join(', ')})`;
    case 'max-duration':
      return `maxDuration = ${pattern.value}`;
    case 'edge-runtime':
      return `runtime = '${pattern.runtime}'`;
    case 'runtime-fs':
      return pattern.method;
    case 'ip-header':
      return `${pattern.headerName} header`;
    case 'streaming-callback':
      return `${pattern.callbackName} callback`;
    case 'vercel-analytics':
      return `${pattern.package} import`;
    case 'vercel-og':
      return `@vercel/og import`;
  }
}

function getHint(pattern: DetectedPattern): string {
  switch (pattern.type) {
    case 'vercel-kv':
      if (pattern.confidence === 'AUTO') return 'Will rewrite to D1 adapter';
      return 'Uses list ops (lpush/lrange) -- D1 adapter needs review';
    case 'max-duration':
      return 'Will be removed';
    case 'edge-runtime':
      return 'Will be removed (Workers are edge-native)';
    case 'runtime-fs':
      if (pattern.confidence === 'REVIEW')
        return 'Static path, may need build-time bundling';
      return 'Dynamic path, requires manual pre-bundling';
    case 'ip-header':
      return 'CF-Connecting-IP fallback will be added';
    case 'streaming-callback':
      return 'Needs ctx.waitUntil() wrapping';
    case 'vercel-analytics':
      return 'Will be removed';
    case 'vercel-og':
      return 'Will rewrite to next/og';
  }
}

function colorConfidence(confidence: string): string {
  switch (confidence) {
    case 'AUTO':
      return chalk.green('AUTO');
    case 'REVIEW':
      return chalk.yellow('REVIEW');
    case 'MANUAL':
      return chalk.red('MANUAL');
    default:
      return confidence;
  }
}

export function formatReport(model: ProjectModel): void {
  // Group patterns by file
  const byFile = new Map<string, DetectedPattern[]>();
  for (const pattern of model.patterns) {
    const existing = byFile.get(pattern.file) ?? [];
    existing.push(pattern);
    byFile.set(pattern.file, existing);
  }

  // Print each file group
  for (const [file, patterns] of byFile) {
    console.log(`\n  ${chalk.underline(file)}`);
    for (const pattern of patterns) {
      const desc = getDescription(pattern);
      const confidence = colorConfidence(pattern.confidence);
      const hint = getHint(pattern);
      console.log(
        `    line ${String(pattern.line).padEnd(4)} ${desc.padEnd(30)} ${confidence.padEnd(16)} ${hint}`
      );
    }
  }

  // Print summary
  console.log('');
  console.log(
    chalk.bold(
      `  Found ${model.summary.total} patterns: ${model.summary.auto} auto-convertible, ${model.summary.review} need review, ${model.summary.manual} need manual work`
    )
  );
  console.log('');
}
