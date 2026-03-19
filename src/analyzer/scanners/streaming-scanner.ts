import { SyntaxKind } from 'ts-morph';
import type { Scanner, ScanContext } from '../types.js';
import type { DetectedPattern } from '../../schemas/project-model.js';
import { assignConfidence } from '../../schemas/confidence.js';

/**
 * Pass 4: Streaming Scanner
 *
 * Detects streaming callback patterns (onFinish, onChunk, onCompletion)
 * inside AI SDK streaming function calls (streamText, streamObject, etc.).
 */

const STREAMING_FUNCTIONS = new Set([
  'streamText',
  'streamObject',
  'streamUI',
]);

const STREAMING_CALLBACKS = new Set([
  'onFinish',
  'onChunk',
  'onCompletion',
]);

export const streamingScanner: Scanner = {
  name: 'streaming-scanner',

  scan(context: ScanContext): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const sourceFile of context.sourceFiles) {
      // Find all call expressions
      const callExpressions = sourceFile.getDescendantsOfKind(
        SyntaxKind.CallExpression
      );

      for (const call of callExpressions) {
        const exprText = call.getExpression().getText();

        // Check if this is a streaming function call
        if (!STREAMING_FUNCTIONS.has(exprText)) continue;

        // Look for streaming callbacks in the arguments
        const args = call.getArguments();
        for (const arg of args) {
          // Check if argument is an object literal with callback properties
          if (!arg.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

          const properties = arg.getProperties();
          for (const prop of properties) {
            if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

            const propName = prop.getName();
            if (!STREAMING_CALLBACKS.has(propName)) continue;

            patterns.push({
              type: 'streaming-callback',
              file: sourceFile.getFilePath(),
              line: prop.getStartLineNumber(),
              callbackName: propName,
              confidence: assignConfidence('streaming-callback', {}),
            });
          }
        }
      }
    }

    return patterns;
  },
};
