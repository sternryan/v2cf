import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../../schemas/project-model.js';
import type {
  TransformRule,
  TransformResult,
  TransformContext,
  ChangeDescription,
} from '../types.js';

const FLAGGER_COMMENT =
  '// V2CF_MANUAL: This fs.readFileSync call will fail in CF Workers runtime.\n' +
  '  // Suggestion: Move this read to build-time or use a static import.';

/**
 * XFRM-06: FS Flagger
 *
 * Inserts V2CF_MANUAL warning comments above runtime fs.readFileSync calls
 * without modifying the calls themselves. This transform flags the pattern
 * for manual review rather than auto-converting it.
 *
 * Unlike other transforms, this one processes ALL confidence tiers (including
 * MANUAL) since fs patterns are always flagged, never auto-transformed in Phase 2.
 */
export const fsFlagger: TransformRule = {
  id: 'fs-flagger',
  name: 'FS Flagger',
  description:
    'Inserts V2CF_MANUAL warning comments above runtime fs.readFileSync calls',
  appliesTo: ['runtime-fs'],
  dependencies: [],
  handlesManual: true,

  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    _context: TransformContext
  ): TransformResult {
    const changes: ChangeDescription[] = [];
    const filePath = sourceFile.getFilePath();

    if (pattern.type !== 'runtime-fs') {
      return {
        ruleId: 'fs-flagger',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [],
      };
    }

    // Idempotency: check if V2CF_MANUAL comment already exists near the pattern line
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n');

    // Search around the pattern line for existing V2CF_MANUAL comment
    // Pattern line is 1-indexed, array is 0-indexed
    const searchStart = Math.max(0, pattern.line - 3);
    const searchEnd = Math.min(lines.length, pattern.line + 1);
    for (let i = searchStart; i < searchEnd; i++) {
      if (lines[i].includes('V2CF_MANUAL')) {
        return {
          ruleId: 'fs-flagger',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }
    }

    // Find the call expression containing fs.readFileSync at or near the pattern line
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const callExpr of callExpressions) {
      const callText = callExpr.getText();
      if (!callText.includes('readFileSync')) continue;

      const callLine = callExpr.getStartLineNumber();
      // Match within a reasonable range of the reported pattern line
      if (Math.abs(callLine - pattern.line) > 2) continue;

      // Find the containing statement to insert before
      const containingStatement =
        callExpr.getFirstAncestorByKind(SyntaxKind.VariableStatement) ||
        callExpr.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);

      if (containingStatement) {
        // Get indentation from the statement
        const stmtText = containingStatement.getText();
        const stmtFullText = containingStatement.getFullText();
        const leadingWhitespace = stmtFullText.match(/^[\s\n]*?([ \t]*)/)?.[1] || '';

        const comment =
          `${leadingWhitespace}// V2CF_MANUAL: This fs.readFileSync call will fail in CF Workers runtime.\n` +
          `${leadingWhitespace}// Suggestion: Move this read to build-time or use a static import.\n`;

        containingStatement.replaceWithText(
          comment + leadingWhitespace + stmtText
        );

        changes.push({
          file: filePath,
          line: pattern.line,
          description: `Flagged fs.readFileSync call for manual review`,
          confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
        });

        break;
      }
    }

    return {
      ruleId: 'fs-flagger',
      applied: changes.length > 0,
      filesModified: changes.length > 0 ? [filePath] : [],
      filesGenerated: [],
      changes,
      warnings: [],
    };
  },
};
