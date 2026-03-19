import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('v2cf CLI', () => {
  it('prints version', () => {
    const output = execSync('npx tsx src/cli.ts --version', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    }).trim();
    expect(output).toBe('0.1.0');
  });

  it('analyze command shows help', () => {
    const output = execSync('npx tsx src/cli.ts analyze --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    }).trim();
    expect(output).toContain('project-dir');
    expect(output).toContain('Analyze a Next.js project');
  });

  it('go command shows help', () => {
    const output = execSync('npx tsx src/cli.ts go --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    }).trim();
    expect(output).toContain('project-dir');
    expect(output).toContain('full v2cf pipeline');
  });

  it('transform command shows help', () => {
    const output = execSync('npx tsx src/cli.ts transform --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    }).trim();
    expect(output).toContain('project-dir');
    expect(output).toContain('dry-run');
  });
});
