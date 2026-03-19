import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { Scanner, ScanContext } from '../types.js';
import type { DetectedPattern } from '../../schemas/project-model.js';
import { assignConfidence } from '../../schemas/confidence.js';

/**
 * Pass 2: Import Scanner
 *
 * Scans source files for @vercel/* import declarations.
 * Detects all import styles: named, aliased, namespace, dynamic, re-export.
 * For @vercel/kv imports, traces operations called on the imported identifier.
 */

const VERCEL_PACKAGES = [
  '@vercel/kv',
  '@vercel/analytics',
  '@vercel/speed-insights',
  '@vercel/og',
  '@vercel/blob',
  '@vercel/postgres',
  '@vercel/edge-config',
] as const;

// Also match subpath imports like @vercel/analytics/react
function matchesVercelPackage(specifier: string): string | null {
  for (const pkg of VERCEL_PACKAGES) {
    if (specifier === pkg || specifier.startsWith(pkg + '/')) {
      return pkg;
    }
  }
  return null;
}

function traceKvOperations(
  sourceFile: SourceFile,
  identifierName: string
): string[] {
  const ops = new Set<string>();

  // Find property access expressions like kv.get, kv.set, store.lpush
  const propAccesses = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression
  );

  for (const access of propAccesses) {
    const expr = access.getExpression();
    const name = access.getName();

    // Direct access: kv.get, store.set
    if (expr.getText() === identifierName) {
      ops.add(name);
    }
  }

  return Array.from(ops);
}

export const importScanner: Scanner = {
  name: 'import-scanner',

  scan(context: ScanContext): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const sourceFile of context.sourceFiles) {
      // Check regular import declarations
      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        const specifier = imp.getModuleSpecifierValue();
        const pkg = matchesVercelPackage(specifier);
        if (!pkg) continue;

        const filePath = sourceFile.getFilePath();
        const line = imp.getStartLineNumber();

        if (pkg === '@vercel/kv') {
          // Determine import style and identifier name
          const namedImports = imp.getNamedImports();
          const namespaceImport = imp.getNamespaceImport();

          let importStyle: 'named' | 'aliased' | 'namespace' = 'named';
          let identifierName = 'kv';

          if (namespaceImport) {
            importStyle = 'namespace';
            identifierName = namespaceImport.getText();
          } else if (namedImports.length > 0) {
            const first = namedImports[0];
            const alias = first.getAliasNode();
            if (alias) {
              importStyle = 'aliased';
              identifierName = alias.getText();
            } else {
              importStyle = 'named';
              identifierName = first.getName();
            }
          }

          // Trace operations
          const operations = traceKvOperations(sourceFile, identifierName);

          patterns.push({
            type: 'vercel-kv',
            file: filePath,
            line,
            package: '@vercel/kv',
            operations,
            importStyle,
            confidence: assignConfidence('vercel-kv', { operations }),
          });
        } else if (
          pkg === '@vercel/analytics' ||
          pkg === '@vercel/speed-insights'
        ) {
          patterns.push({
            type: 'vercel-analytics',
            file: filePath,
            line,
            package: pkg,
            confidence: assignConfidence('vercel-analytics', {}),
          });
        } else if (pkg === '@vercel/og') {
          patterns.push({
            type: 'vercel-og',
            file: filePath,
            line,
            package: '@vercel/og',
            confidence: assignConfidence('vercel-og', {}),
          });
        }
      }

      // Check re-exports: export { kv } from "@vercel/kv"
      const exportDecls = sourceFile.getExportDeclarations();
      for (const exp of exportDecls) {
        const specifier = exp.getModuleSpecifierValue();
        if (!specifier) continue;
        const pkg = matchesVercelPackage(specifier);
        if (!pkg) continue;

        const filePath = sourceFile.getFilePath();
        const line = exp.getStartLineNumber();

        if (pkg === '@vercel/kv') {
          patterns.push({
            type: 'vercel-kv',
            file: filePath,
            line,
            package: '@vercel/kv',
            operations: [],
            importStyle: 'reexport',
            confidence: assignConfidence('vercel-kv', { operations: [] }),
          });
        } else if (
          pkg === '@vercel/analytics' ||
          pkg === '@vercel/speed-insights'
        ) {
          patterns.push({
            type: 'vercel-analytics',
            file: filePath,
            line,
            package: pkg,
            confidence: assignConfidence('vercel-analytics', {}),
          });
        }
      }

      // Check dynamic imports: await import("@vercel/kv")
      const callExpressions = sourceFile.getDescendantsOfKind(
        SyntaxKind.CallExpression
      );
      for (const call of callExpressions) {
        const expr = call.getExpression();
        // Dynamic imports appear as CallExpression with ImportKeyword
        if (expr.getKind() !== SyntaxKind.ImportKeyword) continue;

        const args = call.getArguments();
        if (args.length === 0) continue;

        const firstArg = args[0];
        if (firstArg.getKind() !== SyntaxKind.StringLiteral) continue;

        const specifier = firstArg.getText().replace(/['"]/g, '');
        const pkg = matchesVercelPackage(specifier);
        if (!pkg) continue;

        const filePath = sourceFile.getFilePath();
        const line = call.getStartLineNumber();

        if (pkg === '@vercel/kv') {
          patterns.push({
            type: 'vercel-kv',
            file: filePath,
            line,
            package: '@vercel/kv',
            operations: [],
            importStyle: 'dynamic',
            confidence: assignConfidence('vercel-kv', { operations: [] }),
          });
        } else if (
          pkg === '@vercel/analytics' ||
          pkg === '@vercel/speed-insights'
        ) {
          patterns.push({
            type: 'vercel-analytics',
            file: filePath,
            line,
            package: pkg,
            confidence: assignConfidence('vercel-analytics', {}),
          });
        }
      }
    }

    return patterns;
  },
};
