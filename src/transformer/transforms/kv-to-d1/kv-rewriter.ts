/**
 * XFRM-05: KV-to-D1 Rewriter TransformRule
 *
 * Rewrites `@vercel/kv` imports to use the generated D1 adapter and generates
 * the adapter + migration SQL files in the target project.
 *
 * Handles two branches:
 * 1. Named/aliased imports (AUTO/REVIEW) -- rewrites import, generates files
 * 2. Namespace/dynamic/reexport (MANUAL) -- flags with warning, no rewrite
 */

import type { SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../../../schemas/project-model.js';
import type {
  TransformRule,
  TransformResult,
  TransformContext,
  ChangeDescription,
} from '../../types.js';
import { getAdapterTemplate } from './adapter-template.js';
import { generateMigrationSQL } from './schema-generator.js';

export const kvRewriter: TransformRule = {
  id: 'kv-rewriter',
  name: 'KV-to-D1 Rewriter',
  description:
    'Rewrites @vercel/kv imports to D1 adapter; generates lib/d1-adapter.ts and migrations/0001_kv_schema.sql',
  appliesTo: ['vercel-kv'],
  dependencies: ['import-rewriter'],
  handlesManual: true,

  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    context: TransformContext
  ): TransformResult {
    // Type-narrow to vercel-kv pattern
    if (pattern.type !== 'vercel-kv') {
      return {
        ruleId: 'kv-rewriter',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [],
      };
    }

    // Branch 2: Unsupported import styles (namespace, dynamic, reexport)
    if (
      pattern.importStyle === 'namespace' ||
      pattern.importStyle === 'dynamic' ||
      pattern.importStyle === 'reexport'
    ) {
      return {
        ruleId: 'kv-rewriter',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [
          `Unsupported @vercel/kv import style: ${pattern.importStyle}. Manual migration required -- replace with D1 adapter import.`,
        ],
      };
    }

    // Branch 1: Named or aliased import (AUTO/REVIEW confidence)
    const filePath = sourceFile.getFilePath();
    const changes: ChangeDescription[] = [];
    const filesGenerated: string[] = [];

    // Find the @vercel/kv import declaration
    const imports = sourceFile.getImportDeclarations();
    const kvImport = imports.find(
      (imp) => imp.getModuleSpecifierValue() === '@vercel/kv'
    );

    // Idempotency: if no @vercel/kv import found, already transformed
    if (!kvImport) {
      return {
        ruleId: 'kv-rewriter',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [],
      };
    }

    // Get the current identifier name
    // For `import { kv } from "@vercel/kv"` -> identifier = "kv"
    // For `import { kv as store } from "@vercel/kv"` -> identifier = "store"
    const namedImports = kvImport.getNamedImports();
    let identifier = 'kv'; // default
    if (namedImports.length > 0) {
      const firstNamed = namedImports[0];
      const alias = firstNamed.getAliasNode();
      if (alias) {
        // Aliased: `import { kv as store }` -> use "store"
        identifier = alias.getText();
      } else {
        // Named: `import { kv }` -> use "kv"
        identifier = firstNamed.getName();
      }
    }

    // Remove old import and add new one
    kvImport.remove();
    sourceFile.addImportDeclaration({
      namedImports: [{ name: 'd1kv', alias: identifier }],
      moduleSpecifier: './d1-adapter',
    });

    changes.push({
      file: filePath,
      line: pattern.line,
      description: `Rewrote @vercel/kv import to ./d1-adapter with { d1kv as ${identifier} }`,
      confidence: pattern.confidence as 'AUTO' | 'REVIEW' | 'MANUAL',
    });

    // Generate adapter file (idempotent)
    const adapterPath = `${context.projectDir}/lib/d1-adapter.ts`;
    const existingAdapter = context.project.getSourceFile(adapterPath);
    if (!existingAdapter) {
      context.project.createSourceFile(adapterPath, getAdapterTemplate());
      filesGenerated.push('lib/d1-adapter.ts');
    }

    // Generate migration file (idempotent)
    // Collect ALL operations from ALL vercel-kv patterns in the model
    // to ensure migration covers all KV usage regardless of processing order
    const allOps = collectAllKvOperations(context);
    const migrationPath = `${context.projectDir}/migrations/0001_kv_schema.sql`;
    const existingMigration = context.project.getSourceFile(migrationPath);
    if (!existingMigration) {
      context.project.createSourceFile(
        migrationPath,
        generateMigrationSQL(allOps)
      );
      filesGenerated.push('migrations/0001_kv_schema.sql');
    }

    return {
      ruleId: 'kv-rewriter',
      applied: true,
      filesModified: [filePath],
      filesGenerated,
      changes,
      warnings: [],
    };
  },
};

/**
 * Collect the union of all KV operations across all vercel-kv patterns in the model.
 * This ensures the migration SQL covers all usage regardless of which file is processed first.
 */
function collectAllKvOperations(context: TransformContext): string[] {
  const allOps = new Set<string>();
  for (const p of context.model.patterns) {
    if (p.type === 'vercel-kv') {
      for (const op of p.operations) {
        allOps.add(op);
      }
    }
  }
  return [...allOps];
}
