import type { TransformRule } from '../types.js';
import { directiveCleaner } from './directive-cleaner.js';
import { importRewriter } from './import-rewriter.js';
import { headerAdapter } from './header-adapter.js';

export const transforms: TransformRule[] = [
  directiveCleaner,
  importRewriter,
  headerAdapter,
];
