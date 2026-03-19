import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../../schemas/project-model.js';
import type {
  TransformRule,
  TransformResult,
  TransformContext,
  ChangeDescription,
} from '../types.js';

export const importRewriter: TransformRule = {
  id: 'import-rewriter',
  name: 'Import Rewriter',
  description:
    'Removes @vercel/analytics and @vercel/speed-insights imports (and JSX usage); rewrites @vercel/og to next/og',
  appliesTo: ['vercel-analytics', 'vercel-og'],
  dependencies: [],

  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    _context: TransformContext
  ): TransformResult {
    const changes: ChangeDescription[] = [];
    const filePath = sourceFile.getFilePath();

    if (pattern.type === 'vercel-analytics') {
      const pkg = pattern.package;
      const imports = sourceFile.getImportDeclarations();

      // Find matching imports (exact match or subpath like @vercel/analytics/react)
      const matchingImports = imports.filter((imp) => {
        const specifier = imp.getModuleSpecifierValue();
        return specifier === pkg || specifier.startsWith(pkg + '/');
      });

      // Idempotency: if no matching imports found, already transformed
      if (matchingImports.length === 0) {
        return {
          ruleId: 'import-rewriter',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }

      for (const imp of matchingImports) {
        // Collect named import identifiers BEFORE removing the import
        const namedImports = imp.getNamedImports().map((n) => n.getName());
        const defaultImport = imp.getDefaultImport()?.getText();
        const allNames = [...namedImports];
        if (defaultImport) allNames.push(defaultImport);

        // Remove the import declaration
        imp.remove();

        // Remove JSX usage of imported components
        // Collect positions first, then process in reverse to avoid node invalidation (Pitfall 2)
        for (const name of allNames) {
          // Self-closing: <Analytics />
          const selfClosing = sourceFile
            .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
            .filter((jsx) => jsx.getTagNameNode().getText() === name);

          // Process in reverse order to avoid node invalidation
          for (const jsx of [...selfClosing].reverse()) {
            jsx.replaceWithText('');
          }

          // Opening/closing: <Analytics>...</Analytics>
          const elements = sourceFile
            .getDescendantsOfKind(SyntaxKind.JsxElement)
            .filter(
              (jsx) =>
                jsx.getOpeningElement().getTagNameNode().getText() === name
            );

          for (const jsx of [...elements].reverse()) {
            jsx.replaceWithText('');
          }
        }

        changes.push({
          file: filePath,
          line: pattern.line,
          description: `Removed ${imp.getModuleSpecifierValue ? pkg : pkg} import and component usage`,
          confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
        });
      }
    }

    if (pattern.type === 'vercel-og') {
      const imports = sourceFile.getImportDeclarations();
      const ogImport = imports.find(
        (imp) => imp.getModuleSpecifierValue() === '@vercel/og'
      );

      // Idempotency: if no @vercel/og import found (already rewritten), no-op
      if (!ogImport) {
        return {
          ruleId: 'import-rewriter',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }

      ogImport.setModuleSpecifier('next/og');

      changes.push({
        file: filePath,
        line: pattern.line,
        description: `Rewrote @vercel/og -> next/og`,
        confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
      });
    }

    return {
      ruleId: 'import-rewriter',
      applied: changes.length > 0,
      filesModified: changes.length > 0 ? [filePath] : [],
      filesGenerated: [],
      changes,
      warnings: [],
    };
  },
};
