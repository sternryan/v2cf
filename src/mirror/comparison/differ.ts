import type {
  ReplayResult,
  Divergence,
  ComparisonResult,
  DiffReport,
} from '../types.js';
import { readSession } from '../capture/session-store.js';
import type { NetworkEvent } from '../capture/types.js';
import { shouldIgnoreHeader, shouldIgnoreDivergence } from './ignore-rules.js';
import { compareScreenshots } from './screenshot-compare.js';
import fs from 'node:fs';
import path from 'node:path';

export interface DiffOptions {
  sessionId: string;
  projectDir: string;
  targetUrl: string;
  replayResult: ReplayResult;
  screenshotDir: string;
}

/**
 * Extract the pathname from a URL string. Falls back to the full URL if parsing fails.
 */
function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Generate a behavioral diff report comparing a Vercel capture session
 * against a Cloudflare replay result.
 *
 * Flow:
 * 1. Load the captured session from disk
 * 2. Compare API responses (status codes, bodies, headers)
 * 3. Compare screenshots (if available)
 * 4. Filter out expected platform differences via ignore rules
 * 5. Add replay errors as divergences
 * 6. Build the DiffReport with summary and canFlipDns verdict
 */
export async function generateDiff(options: DiffOptions): Promise<DiffReport> {
  const startTime = Date.now();

  // 1. Load session
  const session = readSession(options.projectDir, options.sessionId);

  // 2. Compare API responses
  const allDivergences: Divergence[] = [];

  // Get non-LLM network events from the capture session (Vercel responses)
  const vercelEvents = session.networkEvents.filter(
    (e: NetworkEvent) => !e.isLlmEndpoint
  );

  // Match Vercel events with Cloudflare replay responses by pathname + method
  for (const vercelEvent of vercelEvents) {
    const vercelPathname = extractPathname(vercelEvent.url);

    const cfMatch = options.replayResult.apiResponses.find(
      (cf) =>
        extractPathname(cf.url) === vercelPathname &&
        cf.method === vercelEvent.method
    );

    if (!cfMatch) {
      // No matching CF response found -- this is informational, not critical
      continue;
    }

    // Compare status codes
    if (vercelEvent.status !== cfMatch.status) {
      allDivergences.push({
        type: 'api',
        severity: 'critical',
        description: `Status code mismatch for ${vercelPathname}`,
        expected: String(vercelEvent.status),
        actual: String(cfMatch.status),
        path: vercelPathname,
      });
    }

    // Compare response bodies
    const vercelBody = vercelEvent.responseBody.trim();
    const cfBody = cfMatch.body.trim();
    if (vercelBody !== cfBody) {
      allDivergences.push({
        type: 'api',
        severity: 'warning',
        description: `Response body differs for ${vercelPathname}`,
        expected: vercelBody.substring(0, 200),
        actual: cfBody.substring(0, 200),
        path: vercelPathname,
      });
    }

    // Compare headers -- only flag non-ignored headers
    const allHeaderNames = new Set([
      ...Object.keys(vercelEvent.responseHeaders),
      ...Object.keys(cfMatch.headers),
    ]);

    for (const headerName of allHeaderNames) {
      if (shouldIgnoreHeader(headerName)) continue;

      const vercelValue = vercelEvent.responseHeaders[headerName] ?? '';
      const cfValue = cfMatch.headers[headerName] ?? '';

      if (vercelValue !== cfValue) {
        allDivergences.push({
          type: 'api',
          severity: 'info',
          description: `Header ${headerName} differs for ${vercelPathname}`,
          expected: vercelValue,
          actual: cfValue,
          path: headerName,
        });
      }
    }
  }

  // 3. Compare screenshots
  const screenshotResults: ComparisonResult['screenshots'] = [];

  for (const targetScreenshot of options.replayResult.screenshots) {
    // For v1, source screenshots are optional. Check if a source screenshot
    // exists in the screenshot directory with a matching name pattern.
    const baseName = path.basename(targetScreenshot);
    const sourceScreenshot = path.join(
      options.screenshotDir,
      'source-' + baseName
    );

    if (fs.existsSync(sourceScreenshot)) {
      const diffPath = path.join(
        options.screenshotDir,
        'diff-' + baseName
      );

      const result = await compareScreenshots(
        sourceScreenshot,
        targetScreenshot,
        diffPath
      );

      screenshotResults.push({
        source: sourceScreenshot,
        target: targetScreenshot,
        diffPath: result.diffImagePath,
        mismatchPercentage: result.mismatchPercentage,
      });
    } else {
      // No source screenshot to compare, include the target with 0% mismatch
      screenshotResults.push({
        source: '',
        target: targetScreenshot,
        mismatchPercentage: 0,
      });
    }
  }

  // 4. Filter out ignored divergences
  const filteredDivergences = allDivergences.filter(
    (d) => !shouldIgnoreDivergence(d)
  );

  // 5. Add replay errors as divergences
  for (const error of options.replayResult.errors) {
    filteredDivergences.push({
      type: 'error',
      severity: 'warning',
      description: error,
      expected: 'no error',
      actual: error,
    });
  }

  // 6. Build ComparisonResult
  const comparison: ComparisonResult = {
    sessionId: options.sessionId,
    sourceUrl: session.sourceUrl,
    targetUrl: options.targetUrl,
    divergences: filteredDivergences,
    screenshots: screenshotResults,
    timestamp: Date.now(),
    duration: Date.now() - startTime,
  };

  // 7. Build summary
  const critical = filteredDivergences.filter(
    (d) => d.severity === 'critical'
  ).length;
  const warnings = filteredDivergences.filter(
    (d) => d.severity === 'warning'
  ).length;
  const info = filteredDivergences.filter(
    (d) => d.severity === 'info'
  ).length;
  const visualMismatch = screenshotResults.some(
    (s) => s.mismatchPercentage > 1
  );
  const canFlipDns = critical === 0 && !visualMismatch;

  // 8. Return DiffReport
  return {
    comparison,
    htmlPath: '', // Will be set by report generator
    summary: {
      totalDivergences: filteredDivergences.length,
      critical,
      warnings,
      info,
      visualMismatch,
      canFlipDns,
    },
  };
}
