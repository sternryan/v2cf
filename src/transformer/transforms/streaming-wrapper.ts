import { SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../../schemas/project-model.js';
import type {
  TransformRule,
  TransformResult,
  TransformContext,
  ChangeDescription,
} from '../types.js';

/**
 * XFRM-07: Streaming Wrapper
 *
 * Wraps onFinish (or other streaming callback) body with ctx.waitUntil(IIFE)
 * pattern using getCloudflareContext from @opennextjs/cloudflare.
 *
 * BEFORE:
 *   onFinish: async ({ text }) => {
 *     await appendMessage(convId, { role: 'assistant', content: text });
 *   }
 *
 * AFTER:
 *   onFinish: async ({ text }) => {
 *     const { ctx } = getCloudflareContext();
 *     ctx.waitUntil((async () => {
 *       await appendMessage(convId, { role: 'assistant', content: text });
 *     })());
 *   }
 *
 * CRITICAL: Uses ctx.waitUntil() as method call. Do NOT destructure waitUntil
 * from ctx -- that causes "Illegal invocation" error.
 */
export const streamingWrapper: TransformRule = {
  id: 'streaming-wrapper',
  name: 'Streaming Wrapper',
  description:
    'Wraps streaming onFinish callbacks with ctx.waitUntil() using getCloudflareContext from @opennextjs/cloudflare',
  appliesTo: ['streaming-callback'],
  dependencies: ['import-rewriter'],

  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    _context: TransformContext
  ): TransformResult {
    const changes: ChangeDescription[] = [];
    const filePath = sourceFile.getFilePath();

    if (pattern.type !== 'streaming-callback') {
      return {
        ruleId: 'streaming-wrapper',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [],
      };
    }

    const callbackName = pattern.callbackName;

    // Find the PropertyAssignment for the callback (e.g., onFinish: async (...) => { ... })
    const propertyAssignments = sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAssignment
    );

    let transformed = false;

    for (const propAssign of propertyAssignments) {
      if (propAssign.getName() !== callbackName) continue;

      const initializer = propAssign.getInitializer();
      if (!initializer) continue;

      // Handle ArrowFunction or FunctionExpression
      const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
      const isFuncExpr = initializer.getKind() === SyntaxKind.FunctionExpression;

      if (!isArrow && !isFuncExpr) continue;

      // Get the function body
      let body;
      if (isArrow) {
        body = initializer.asKindOrThrow(SyntaxKind.ArrowFunction).getBody();
      } else {
        body = initializer.asKindOrThrow(SyntaxKind.FunctionExpression).getBody();
      }

      if (!body || body.getKind() !== SyntaxKind.Block) continue;

      const block = body.asKindOrThrow(SyntaxKind.Block);

      // Idempotency: check if body already contains getCloudflareContext
      const bodyText = block.getText();
      if (bodyText.includes('getCloudflareContext')) {
        return {
          ruleId: 'streaming-wrapper',
          applied: false,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      }

      // Collect the existing body statements as text BEFORE modifying
      const statements = block.getStatements();
      const originalBodyStatements = statements
        .map((s) => s.getText())
        .join('\n    ');

      // Replace the body with wrapped version
      // Strategy: replace the entire block text
      const wrappedBody =
        `{\n` +
        `    const { ctx } = getCloudflareContext();\n` +
        `    ctx.waitUntil((async () => {\n` +
        `      ${originalBodyStatements}\n` +
        `    })());\n` +
        `  }`;

      block.replaceWithText(wrappedBody);

      transformed = true;

      changes.push({
        file: filePath,
        line: pattern.line,
        description: `Wrapped ${callbackName} callback body with ctx.waitUntil(IIFE)`,
        confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
      });

      break; // Only process the first matching callback
    }

    // Add getCloudflareContext import if we transformed something
    if (transformed) {
      // Check if import already exists (idempotency)
      const existingImports = sourceFile.getImportDeclarations();
      const alreadyImported = existingImports.some(
        (imp) =>
          imp.getModuleSpecifierValue() === '@opennextjs/cloudflare' &&
          imp
            .getNamedImports()
            .some((ni) => ni.getName() === 'getCloudflareContext')
      );

      if (!alreadyImported) {
        sourceFile.addImportDeclaration({
          namedImports: ['getCloudflareContext'],
          moduleSpecifier: '@opennextjs/cloudflare',
        });

        changes.push({
          file: filePath,
          line: 1,
          description:
            'Added import { getCloudflareContext } from @opennextjs/cloudflare',
          confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
        });
      }
    }

    return {
      ruleId: 'streaming-wrapper',
      applied: transformed,
      filesModified: transformed ? [filePath] : [],
      filesGenerated: [],
      changes,
      warnings: [],
    };
  },
};
