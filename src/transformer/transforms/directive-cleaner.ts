import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../../schemas/project-model.js';
import type {
  TransformRule,
  TransformResult,
  TransformContext,
  ChangeDescription,
} from '../types.js';

export const directiveCleaner: TransformRule = {
  id: 'directive-cleaner',
  name: 'Directive Cleaner',
  description:
    'Removes Vercel-specific directives (maxDuration, edge runtime) and replaces with informative comments',
  appliesTo: ['max-duration', 'edge-runtime'],
  dependencies: [],

  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    _context: TransformContext
  ): TransformResult {
    const changes: ChangeDescription[] = [];
    const warnings: string[] = [];
    const filePath = sourceFile.getFilePath();

    if (pattern.type === 'max-duration') {
      const exportedDecls = sourceFile.getExportedDeclarations();
      const maxDurDecls = exportedDecls.get('maxDuration');

      // Idempotency: if no maxDuration export found, already transformed
      if (!maxDurDecls || maxDurDecls.length === 0) {
        return {
          ruleId: 'directive-cleaner',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }

      const decl = maxDurDecls[0];
      const varStatement = decl.getFirstAncestorByKind(
        SyntaxKind.VariableStatement
      );

      if (varStatement) {
        const value = pattern.value;
        varStatement.replaceWithText(
          `// v2cf: Removed maxDuration = ${value}. CF Workers: 30s CPU limit (paid),\n` +
            `// wall-clock I/O time is unlimited while client is connected.`
        );

        changes.push({
          file: filePath,
          line: pattern.line,
          description: `Removed export const maxDuration = ${value}`,
          confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
        });

        if (value > 30) {
          warnings.push(
            `Route ${filePath} had maxDuration=${value}s. ` +
              `CF Workers CPU limit is 30s. Verify this route completes within limits.`
          );
        }
      }
    }

    if (pattern.type === 'edge-runtime') {
      const exportedDecls = sourceFile.getExportedDeclarations();
      const runtimeDecls = exportedDecls.get('runtime');

      // Idempotency: if no runtime export found, already transformed
      if (!runtimeDecls || runtimeDecls.length === 0) {
        return {
          ruleId: 'directive-cleaner',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }

      const decl = runtimeDecls[0];
      const varStatement = decl.getFirstAncestorByKind(
        SyntaxKind.VariableStatement
      );

      if (varStatement) {
        varStatement.replaceWithText(
          `// v2cf: Removed runtime = 'edge'. CF Workers are edge-native.`
        );

        changes.push({
          file: filePath,
          line: pattern.line,
          description: `Removed export const runtime = 'edge'`,
          confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
        });
      }
    }

    return {
      ruleId: 'directive-cleaner',
      applied: changes.length > 0,
      filesModified: changes.length > 0 ? [filePath] : [],
      filesGenerated: [],
      changes,
      warnings,
    };
  },
};
