import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateHtmlReport } from '../../../src/mirror/comparison/report-generator.js';
import type { DiffReport } from '../../../src/mirror/types.js';

describe('generateHtmlReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cf-report-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeReport(overrides?: Partial<DiffReport>): DiffReport {
    return {
      comparison: {
        sessionId: 'sess_test_report',
        sourceUrl: 'https://example.vercel.app',
        targetUrl: 'https://cf.example.com',
        divergences: [],
        screenshots: [],
        timestamp: Date.now(),
        duration: 500,
      },
      htmlPath: '',
      summary: {
        totalDivergences: 0,
        critical: 0,
        warnings: 0,
        info: 0,
        visualMismatch: false,
        canFlipDns: true,
      },
      ...overrides,
    };
  }

  it('writes an HTML file to the specified path', () => {
    const outputPath = path.join(tmpDir, 'reports', 'test.html');
    const result = generateHtmlReport(makeReport(), outputPath);

    expect(result).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('contains the report title', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(makeReport(), outputPath);
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('v2cf Mirror Validation Report');
  });

  it('shows READY TO FLIP DNS when canFlipDns is true', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(
      makeReport({ summary: { totalDivergences: 0, critical: 0, warnings: 0, info: 0, visualMismatch: false, canFlipDns: true } }),
      outputPath
    );
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('READY TO FLIP DNS');
    expect(html).not.toContain('DIVERGENCES DETECTED');
  });

  it('shows DIVERGENCES DETECTED when canFlipDns is false', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(
      makeReport({
        comparison: {
          sessionId: 'sess_test_report',
          sourceUrl: 'https://example.vercel.app',
          targetUrl: 'https://cf.example.com',
          divergences: [
            {
              type: 'api',
              severity: 'critical',
              description: 'Status code mismatch for /api/health',
              expected: '200',
              actual: '500',
            },
          ],
          screenshots: [],
          timestamp: Date.now(),
          duration: 500,
        },
        summary: { totalDivergences: 1, critical: 1, warnings: 0, info: 0, visualMismatch: false, canFlipDns: false },
      }),
      outputPath
    );
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('DIVERGENCES DETECTED');
  });

  it('contains the session ID', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(makeReport(), outputPath);
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('sess_test_report');
  });

  it('contains divergence descriptions in the table', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(
      makeReport({
        comparison: {
          sessionId: 'sess_test_report',
          sourceUrl: 'https://example.vercel.app',
          targetUrl: 'https://cf.example.com',
          divergences: [
            {
              type: 'api',
              severity: 'warning',
              description: 'Response body differs for /api/data',
              expected: '{"count":10}',
              actual: '{"count":5}',
            },
          ],
          screenshots: [],
          timestamp: Date.now(),
          duration: 500,
        },
        summary: { totalDivergences: 1, critical: 0, warnings: 1, info: 0, visualMismatch: false, canFlipDns: true },
      }),
      outputPath
    );
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('Response body differs for /api/data');
    expect(html).toContain('WARNING');
  });

  it('shows source and target URLs', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(makeReport(), outputPath);
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('https://example.vercel.app');
    expect(html).toContain('https://cf.example.com');
  });

  it('includes severity counts', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(
      makeReport({
        summary: { totalDivergences: 3, critical: 1, warnings: 1, info: 1, visualMismatch: false, canFlipDns: false },
      }),
      outputPath
    );
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).toContain('Critical: 1');
    expect(html).toContain('Warnings: 1');
    expect(html).toContain('Info: 1');
  });

  it('escapes HTML in descriptions', () => {
    const outputPath = path.join(tmpDir, 'test.html');
    generateHtmlReport(
      makeReport({
        comparison: {
          sessionId: 'sess_test_report',
          sourceUrl: 'https://example.vercel.app',
          targetUrl: 'https://cf.example.com',
          divergences: [
            {
              type: 'api',
              severity: 'info',
              description: 'Header <script>alert("xss")</script>',
              expected: '<b>bold</b>',
              actual: 'normal',
            },
          ],
          screenshots: [],
          timestamp: Date.now(),
          duration: 500,
        },
        summary: { totalDivergences: 1, critical: 0, warnings: 0, info: 1, visualMismatch: false, canFlipDns: true },
      }),
      outputPath
    );
    const html = fs.readFileSync(outputPath, 'utf-8');

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
