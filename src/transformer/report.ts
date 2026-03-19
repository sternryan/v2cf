import chalk from 'chalk';
import type { TransformResult } from './types.js';
import type { DetectedPattern } from '../schemas/project-model.js';

function getPatternDescription(pattern: DetectedPattern): string {
  switch (pattern.type) {
    case 'vercel-kv':
      return `@vercel/kv import (${pattern.operations.join(', ')})`;
    case 'max-duration':
      return `maxDuration = ${pattern.value}`;
    case 'edge-runtime':
      return `runtime = '${pattern.runtime}'`;
    case 'runtime-fs':
      return `${pattern.method}(${pattern.pathExpression})`;
    case 'ip-header':
      return `${pattern.headerName} header access`;
    case 'streaming-callback':
      return `${pattern.callbackName} callback`;
    case 'vercel-analytics':
      return `${pattern.package} import`;
    case 'vercel-og':
      return `@vercel/og import`;
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

export function formatTransformReport(
  results: TransformResult[],
  manualPatterns: DetectedPattern[]
): void {
  const appliedResults = results.filter((r) => r.applied);
  const allChanges = appliedResults.flatMap((r) => r.changes);
  const allWarnings = results.flatMap((r) => r.warnings);

  // Section 1: Applied Changes
  console.log('');
  console.log(chalk.bold('  Applied Changes'));
  console.log('');

  if (allChanges.length === 0) {
    console.log('  No changes applied.');
  } else {
    // Group changes by file
    const byFile = new Map<string, typeof allChanges>();
    for (const change of allChanges) {
      const existing = byFile.get(change.file) ?? [];
      existing.push(change);
      byFile.set(change.file, existing);
    }

    for (const [file, changes] of byFile) {
      console.log(`  ${chalk.underline(file)}`);
      for (const change of changes) {
        const conf = colorConfidence(change.confidence);
        console.log(
          `    line ${String(change.line).padEnd(4)} ${change.description.padEnd(40)} ${conf}`
        );
      }
    }
  }

  // Warnings
  if (allWarnings.length > 0) {
    console.log('');
    console.log(chalk.bold('  Warnings'));
    console.log('');
    for (const warning of allWarnings) {
      console.log(`  ${chalk.yellow('!')} ${warning}`);
    }
  }

  // Section 2: Flagged Items (Manual)
  console.log('');
  console.log(chalk.bold('  Flagged Items (Manual Review Required)'));
  console.log('');

  if (manualPatterns.length === 0) {
    console.log('  No items flagged for manual review.');
  } else {
    for (const pattern of manualPatterns) {
      const desc = getPatternDescription(pattern);
      console.log(
        `  ${chalk.red('MANUAL')}  ${pattern.file}:${pattern.line}  ${desc}`
      );
    }
  }

  // Section 3: Summary
  const filesModified = new Set(appliedResults.flatMap((r) => r.filesModified));
  const filesGenerated = new Set(
    appliedResults.flatMap((r) => r.filesGenerated)
  );

  console.log('');
  console.log(
    chalk.bold(
      `  Applied ${allChanges.length} change${allChanges.length !== 1 ? 's' : ''} across ${filesModified.size} file${filesModified.size !== 1 ? 's' : ''}.` +
        (filesGenerated.size > 0
          ? ` Generated ${filesGenerated.size} new file${filesGenerated.size !== 1 ? 's' : ''}.`
          : '') +
        ` ${manualPatterns.length} item${manualPatterns.length !== 1 ? 's' : ''} flagged for manual review.`
    )
  );
  console.log('');
}
