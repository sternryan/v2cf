import { describe, it, expect } from 'vitest';
import { loadProject } from '../../src/analyzer/project-loader.js';
import path from 'path';

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '../fixtures/stripped'
);

describe('project-loader', () => {
  it('creates ts-morph Project from fixtures/stripped directory', () => {
    const result = loadProject(FIXTURES_DIR);
    expect(result.project).toBeDefined();
    expect(result.sourceFiles.length).toBeGreaterThan(0);
    expect(result.dependencies).toBeDefined();
  });

  it('finds .ts and .tsx source files in fixtures/stripped', () => {
    const result = loadProject(FIXTURES_DIR);
    const filePaths = result.sourceFiles.map((sf) => sf.getFilePath());
    const hasTs = filePaths.some((fp) => fp.endsWith('.ts'));
    expect(hasTs).toBe(true);
  });

  it('excludes node_modules', () => {
    const result = loadProject(FIXTURES_DIR);
    const filePaths = result.sourceFiles.map((sf) => sf.getFilePath());
    const hasNodeModules = filePaths.some((fp) => fp.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });

  it('throws clear error when directory has no package.json', () => {
    const emptyDir = path.resolve(import.meta.dirname, '../fixtures');
    expect(() => loadProject(emptyDir)).toThrow('No package.json found');
  });
});
