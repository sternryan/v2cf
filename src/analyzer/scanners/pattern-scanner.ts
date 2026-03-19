import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { Scanner, ScanContext } from '../types.js';
import type { DetectedPattern } from '../../schemas/project-model.js';
import { assignConfidence } from '../../schemas/confidence.js';

/**
 * Pass 3: Pattern Scanner
 *
 * Detects Vercel-specific runtime patterns:
 * - maxDuration export directive
 * - edge runtime export directive
 * - IP header access (x-forwarded-for, x-real-ip)
 * - fs.readFileSync in runtime paths
 */

// Only scan files in runtime paths -- skip scripts, tests, config files
const RUNTIME_PATH_SEGMENTS = [
  '/app/',
  '/pages/',
  '/src/',
  '/lib/',
  '/components/',
];
const EXCLUDE_PATH_SEGMENTS = ['/scripts/', '/__tests__/', '/test/'];
const EXCLUDE_EXTENSIONS = ['.config.ts', '.config.js', '.config.mjs'];

function isRuntimeFile(filePath: string): boolean {
  // Exclude non-runtime paths
  if (EXCLUDE_PATH_SEGMENTS.some((seg) => filePath.includes(seg))) {
    return false;
  }
  if (EXCLUDE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    return false;
  }
  // Include only runtime paths
  return RUNTIME_PATH_SEGMENTS.some((seg) => filePath.includes(seg));
}

const VERCEL_HEADERS = ['x-forwarded-for', 'x-real-ip'];

function scanMaxDuration(sourceFile: SourceFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const exportedDecls = sourceFile.getExportedDeclarations();

  for (const [name, decls] of exportedDecls) {
    if (name === 'maxDuration') {
      for (const decl of decls) {
        if (decl.isKind(SyntaxKind.VariableDeclaration)) {
          const init = decl.getInitializer();
          const value = init?.isKind(SyntaxKind.NumericLiteral)
            ? Number(init.getText())
            : 0;

          patterns.push({
            type: 'max-duration',
            file: sourceFile.getFilePath(),
            line: decl.getStartLineNumber(),
            value,
            confidence: assignConfidence('max-duration', {}),
          });
        }
      }
    }
  }

  return patterns;
}

function scanEdgeRuntime(sourceFile: SourceFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const exportedDecls = sourceFile.getExportedDeclarations();

  for (const [name, decls] of exportedDecls) {
    if (name === 'runtime') {
      for (const decl of decls) {
        if (decl.isKind(SyntaxKind.VariableDeclaration)) {
          const init = decl.getInitializer();
          if (init?.isKind(SyntaxKind.StringLiteral)) {
            const value = init.getLiteralValue();
            if (value === 'edge') {
              patterns.push({
                type: 'edge-runtime',
                file: sourceFile.getFilePath(),
                line: decl.getStartLineNumber(),
                runtime: value,
                confidence: assignConfidence('edge-runtime', {}),
              });
            }
          }
        }
      }
    }
  }

  return patterns;
}

function scanIpHeaders(sourceFile: SourceFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const stringLiterals = sourceFile.getDescendantsOfKind(
    SyntaxKind.StringLiteral
  );

  for (const lit of stringLiterals) {
    const value = lit.getLiteralValue();
    if (!VERCEL_HEADERS.includes(value)) continue;

    // Check if this string is used in a header access context
    // Look for .get("x-forwarded-for") pattern
    const parent = lit.getParent();
    if (!parent) continue;

    // Case 1: Direct argument to a call expression like headers.get("x-forwarded-for")
    if (parent.isKind(SyntaxKind.CallExpression)) {
      patterns.push({
        type: 'ip-header',
        file: sourceFile.getFilePath(),
        line: lit.getStartLineNumber(),
        headerName: value,
        confidence: assignConfidence('ip-header', {}),
      });
      continue;
    }

    // Case 2: Argument inside a call expression -- the parent might be the argument list
    // Check if grandparent is a call expression
    const grandparent = parent?.getParent();
    if (grandparent?.isKind(SyntaxKind.CallExpression)) {
      // Check if the call is a .get() method
      const callExpr = grandparent;
      const exprNode = callExpr.getExpression();
      if (exprNode.isKind(SyntaxKind.PropertyAccessExpression)) {
        const methodName = exprNode.getName();
        if (methodName === 'get') {
          patterns.push({
            type: 'ip-header',
            file: sourceFile.getFilePath(),
            line: lit.getStartLineNumber(),
            headerName: value,
            confidence: assignConfidence('ip-header', {}),
          });
        }
      }
    }
  }

  return patterns;
}

function scanRuntimeFs(sourceFile: SourceFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const filePath = sourceFile.getFilePath();

  // Only scan runtime files
  if (!isRuntimeFile(filePath)) return [];

  // Check if fs is imported
  const imports = sourceFile.getImportDeclarations();
  let hasFsImport = false;
  for (const imp of imports) {
    const specifier = imp.getModuleSpecifierValue();
    if (specifier === 'fs' || specifier === 'node:fs') {
      hasFsImport = true;
      break;
    }
  }

  if (!hasFsImport) return [];

  // Scan for readFileSync calls
  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    const expr = call.getExpression();
    const exprText = expr.getText();

    // Match fs.readFileSync or readFileSync
    if (
      exprText !== 'fs.readFileSync' &&
      exprText !== 'readFileSync'
    ) {
      continue;
    }

    // Determine if the path argument is static
    const args = call.getArguments();
    let isStaticPath = false;
    let pathExpression = '';

    if (args.length > 0) {
      const firstArg = args[0];
      pathExpression = firstArg.getText();

      // Static path: string literal
      if (firstArg.isKind(SyntaxKind.StringLiteral)) {
        isStaticPath = true;
      }
      // Static path: template literal with no substitutions
      else if (firstArg.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
        isStaticPath = true;
      }
      // Static path: path.join(process.cwd(), ...) with string args
      else if (firstArg.isKind(SyntaxKind.CallExpression)) {
        const callText = firstArg.getText();
        if (callText.includes('path.join') || callText.includes('path.resolve')) {
          // Check if all arguments are string literals or process.cwd()
          const callArgs = firstArg.asKind(SyntaxKind.CallExpression)?.getArguments() ?? [];
          isStaticPath = callArgs.every(
            (arg) =>
              arg.isKind(SyntaxKind.StringLiteral) ||
              arg.getText() === 'process.cwd()' ||
              arg.getText() === '__dirname'
          );
        }
      }
    }

    patterns.push({
      type: 'runtime-fs',
      file: filePath,
      line: call.getStartLineNumber(),
      method: exprText,
      pathExpression,
      isStaticPath,
      confidence: assignConfidence('runtime-fs', { isStaticPath }),
    });
  }

  return patterns;
}

export const patternScanner: Scanner = {
  name: 'pattern-scanner',

  scan(context: ScanContext): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const sourceFile of context.sourceFiles) {
      patterns.push(...scanMaxDuration(sourceFile));
      patterns.push(...scanEdgeRuntime(sourceFile));
      patterns.push(...scanIpHeaders(sourceFile));
      patterns.push(...scanRuntimeFs(sourceFile));
    }

    return patterns;
  },
};
