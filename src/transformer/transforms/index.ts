import type { TransformRule } from '../types.js';
import { directiveCleaner } from './directive-cleaner.js';
import { importRewriter } from './import-rewriter.js';
import { headerAdapter } from './header-adapter.js';
import { fsFlagger } from './fs-flagger.js';
import { streamingWrapper } from './streaming-wrapper.js';

export const transforms: TransformRule[] = [
  directiveCleaner,
  importRewriter,
  headerAdapter,
  fsFlagger,
  streamingWrapper,
];
