import type { TransformRule } from '../types.js';
import { directiveCleaner } from './directive-cleaner.js';
import { importRewriter } from './import-rewriter.js';

export const transforms: TransformRule[] = [directiveCleaner, importRewriter];
