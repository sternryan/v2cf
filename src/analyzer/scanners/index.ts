import type { Scanner } from '../types.js';
import { dependencyScanner } from './dependency-scanner.js';
import { importScanner } from './import-scanner.js';
import { patternScanner } from './pattern-scanner.js';
import { streamingScanner } from './streaming-scanner.js';

// Order matters: dependency-scanner must run first (populates detectedPackages),
// then import-scanner (uses detectedPackages), then pattern/streaming scanners.
export const scanners: Scanner[] = [
  dependencyScanner,
  importScanner,
  patternScanner,
  streamingScanner,
];
