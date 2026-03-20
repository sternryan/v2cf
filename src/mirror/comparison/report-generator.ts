import fs from 'node:fs';
import path from 'node:path';
import type { DiffReport } from '../types.js';

/**
 * Generate a self-contained HTML report for the behavioral diff.
 *
 * The report includes:
 * - Summary header with session info and verdict (canFlipDns)
 * - Divergence table with severity badges and expected/actual values
 * - Screenshot section with inline base64 images
 * - Footer with timestamp and v2cf version
 *
 * All CSS is embedded inline -- no external dependencies.
 */
export function generateHtmlReport(
  report: DiffReport,
  outputPath: string
): string {
  const { comparison, summary } = report;

  const verdictHtml = summary.canFlipDns
    ? '<div class="verdict pass">READY TO FLIP DNS</div>'
    : '<div class="verdict fail">DIVERGENCES DETECTED</div>';

  const divergenceRows = comparison.divergences
    .map((d) => {
      const severityClass = d.severity;
      return `<tr class="row-${severityClass}">
        <td><span class="badge badge-${severityClass}">${d.severity.toUpperCase()}</span></td>
        <td>${escapeHtml(d.type)}</td>
        <td>${escapeHtml(d.description)}</td>
        <td class="mono">${escapeHtml(d.expected)}</td>
        <td class="mono">${escapeHtml(d.actual)}</td>
      </tr>`;
    })
    .join('\n');

  const screenshotHtml = comparison.screenshots
    .map((s) => {
      let imgHtml = '';

      // Embed target (Cloudflare) screenshot as base64 if file exists
      if (s.target && fs.existsSync(s.target)) {
        const targetData = fs.readFileSync(s.target).toString('base64');
        imgHtml += `<div class="screenshot-panel">
          <h4>Cloudflare Replay</h4>
          <img src="data:image/png;base64,${targetData}" alt="Cloudflare replay screenshot" />
        </div>`;
      }

      // Embed diff image as base64 if it exists
      if (s.diffPath && fs.existsSync(s.diffPath)) {
        const diffData = fs.readFileSync(s.diffPath).toString('base64');
        imgHtml += `<div class="screenshot-panel">
          <h4>Diff (${s.mismatchPercentage.toFixed(2)}% mismatch)</h4>
          <img src="data:image/png;base64,${diffData}" alt="Screenshot diff" />
        </div>`;
      }

      if (!imgHtml) {
        imgHtml = `<p>Mismatch: ${s.mismatchPercentage.toFixed(2)}%</p>`;
      }

      return `<div class="screenshot-section">${imgHtml}</div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>v2cf Mirror Validation Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; color: #111827; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 24px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 16px 0 8px; }
    h4 { font-size: 14px; margin-bottom: 8px; color: #6b7280; }

    .summary-box { background: #f3f4f6; border-radius: 8px; padding: 24px; margin: 16px 0; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
    .summary-item { font-size: 14px; }
    .summary-item strong { display: block; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

    .verdict { font-size: 24px; font-weight: bold; margin: 16px 0; padding: 16px; border-radius: 8px; text-align: center; }
    .verdict.pass { color: #22c55e; background: #f0fdf4; border: 2px solid #22c55e; }
    .verdict.fail { color: #ef4444; background: #fef2f2; border: 2px solid #ef4444; }

    .counts { display: flex; gap: 16px; margin: 12px 0; }
    .count-item { font-size: 14px; font-weight: 600; }
    .count-critical { color: #ef4444; }
    .count-warning { color: #f59e0b; }
    .count-info { color: #6b7280; }

    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; padding: 10px 12px; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; font-size: 13px; text-transform: uppercase; color: #6b7280; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; vertical-align: top; }
    tr.row-critical { background: #fef2f2; }
    tr.row-warning { background: #fffbeb; }
    td.mono { font-family: ui-monospace, monospace; font-size: 12px; max-width: 300px; overflow-wrap: break-word; }

    .badge { display: inline-block; border-radius: 4px; font-size: 12px; font-weight: 600; color: white; padding: 2px 8px; }
    .badge-critical { background: #ef4444; }
    .badge-warning { background: #f59e0b; }
    .badge-info { background: #9ca3af; }

    .screenshot-section { margin: 12px 0; display: flex; gap: 16px; flex-wrap: wrap; }
    .screenshot-panel { flex: 1; min-width: 300px; }
    .screenshot-panel img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; }

    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>v2cf Mirror Validation Report</h1>

    <div class="summary-box">
      <div class="summary-grid">
        <div class="summary-item">
          <strong>Session ID</strong>
          ${escapeHtml(comparison.sessionId)}
        </div>
        <div class="summary-item">
          <strong>Timestamp</strong>
          ${new Date(comparison.timestamp).toISOString()}
        </div>
        <div class="summary-item">
          <strong>Source (Vercel)</strong>
          ${escapeHtml(comparison.sourceUrl)}
        </div>
        <div class="summary-item">
          <strong>Target (Cloudflare)</strong>
          ${escapeHtml(comparison.targetUrl)}
        </div>
      </div>

      ${verdictHtml}

      <div class="counts">
        <span class="count-item count-critical">Critical: ${summary.critical}</span>
        <span class="count-item count-warning">Warnings: ${summary.warnings}</span>
        <span class="count-item count-info">Info: ${summary.info}</span>
      </div>
    </div>

    ${
      comparison.divergences.length > 0
        ? `<h2>Divergences</h2>
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Type</th>
          <th>Description</th>
          <th>Expected (Vercel)</th>
          <th>Actual (Cloudflare)</th>
        </tr>
      </thead>
      <tbody>
        ${divergenceRows}
      </tbody>
    </table>`
        : '<h2>Divergences</h2><p>No divergences found.</p>'
    }

    ${
      comparison.screenshots.length > 0
        ? `<h2>Screenshots</h2>${screenshotHtml}`
        : ''
    }

    <div class="footer">
      Generated by v2cf at ${new Date().toISOString()} | Duration: ${comparison.duration}ms
    </div>
  </div>
</body>
</html>`;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

/**
 * Escape HTML special characters to prevent XSS in the report.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
