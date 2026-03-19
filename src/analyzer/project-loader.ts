import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import path from 'path';
import fs from 'fs';

export function loadProject(targetDir: string): {
  project: Project;
  sourceFiles: SourceFile[];
  dependencies: Record<string, string>;
} {
  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `No package.json found at ${targetDir}. Is this a Node.js project?`
    );
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const tsconfigPath = path.join(targetDir, 'tsconfig.json');
  const hasTsConfig = fs.existsSync(tsconfigPath);

  const project = new Project({
    ...(hasTsConfig
      ? { tsConfigFilePath: tsconfigPath, skipAddingFilesFromTsConfig: true }
      : {
          compilerOptions: {
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
            moduleResolution: ModuleResolutionKind.Bundler,
            jsx: ts.JsxEmit.ReactJSX,
            strict: true,
            esModuleInterop: true,
            allowJs: true,
          },
        }),
  });

  project.addSourceFilesAtPaths([
    path.join(targetDir, '{app,pages,src,lib,components}/**/*.{ts,tsx,js,jsx}'),
  ]);

  // Filter out any files from node_modules, .next, or dist that might have slipped in
  const sourceFiles = project.getSourceFiles().filter((sf) => {
    const filePath = sf.getFilePath();
    return (
      !filePath.includes('node_modules') &&
      !filePath.includes('.next') &&
      !filePath.includes('/dist/')
    );
  });

  return {
    project,
    sourceFiles,
    dependencies: pkg.dependencies ?? {},
  };
}
