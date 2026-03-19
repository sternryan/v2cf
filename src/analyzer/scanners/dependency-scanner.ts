import type { Scanner, ScanContext } from '../types.js';
import type { DetectedPattern } from '../../schemas/project-model.js';
import { assignConfidence } from '../../schemas/confidence.js';

/**
 * Pass 1: Dependency Scanner
 *
 * Scans package.json dependencies for @vercel/* packages.
 * Populates context.detectedPackages for downstream scanners.
 * Returns patterns only for simple remove-only packages (analytics, speed-insights, og).
 * Does NOT return patterns for @vercel/kv -- the import-scanner handles those with more detail.
 */

// Packages that are handled by import-scanner with deeper analysis
const IMPORT_SCANNER_PACKAGES = new Set([
  '@vercel/kv',
  '@vercel/blob',
  '@vercel/postgres',
  '@vercel/edge-config',
]);

export const dependencyScanner: Scanner = {
  name: 'dependency-scanner',

  scan(context: ScanContext): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const dep of Object.keys(context.dependencies)) {
      if (!dep.startsWith('@vercel/')) continue;

      // Add to detectedPackages for downstream scanners
      context.detectedPackages.push(dep);

      // Skip packages that are handled by import-scanner
      if (IMPORT_SCANNER_PACKAGES.has(dep)) continue;

      // Return patterns for simple remove-only packages
      if (dep === '@vercel/analytics' || dep === '@vercel/speed-insights') {
        patterns.push({
          type: 'vercel-analytics',
          file: 'package.json',
          line: 0,
          package: dep,
          confidence: assignConfidence('vercel-analytics', {}),
        });
      } else if (dep === '@vercel/og') {
        patterns.push({
          type: 'vercel-og',
          file: 'package.json',
          line: 0,
          package: '@vercel/og',
          confidence: assignConfidence('vercel-og', {}),
        });
      }
    }

    return patterns;
  },
};
