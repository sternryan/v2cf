// Shared types consumed by capture (Plan 01), replay (Plan 02), and comparison (Plan 03)

// ReplayOptions -- used by replay engine (Plan 02)
export interface ReplayOptions {
  targetUrl: string; // Cloudflare mirror URL
  sessionId: string; // Session to replay
  projectDir: string; // Project directory (for session loading)
  interceptPatterns: string[]; // URL patterns for LLM response injection (default: ['/api/'])
  actionDelay: number; // ms between Playwright actions (default: 100)
  screenshotDir: string; // Where to save screenshots
  viewport?: { width: number; height: number };
}

// ReplayResult -- output of replay engine, input to comparison engine
export interface ReplayResult {
  screenshots: string[]; // File paths to captured screenshots
  apiResponses: ApiCapture[];
  errors: string[];
  duration: number; // ms
}

export interface ApiCapture {
  url: string;
  method: string;
  status: number;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
}

// Comparison types -- used by comparison engine (Plan 03)
export interface Divergence {
  type: 'api' | 'visual' | 'timing' | 'error';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  expected: string; // Vercel value
  actual: string; // Cloudflare value
  path?: string; // JSON path or CSS selector
}

export interface ComparisonResult {
  sessionId: string;
  sourceUrl: string; // Vercel URL
  targetUrl: string; // Cloudflare URL
  divergences: Divergence[];
  screenshots: {
    source: string; // Vercel screenshot path
    target: string; // CF screenshot path
    diffPath?: string; // pixelmatch diff image path
    mismatchPercentage: number;
  }[];
  timestamp: number;
  duration: number;
}

export interface DiffReport {
  comparison: ComparisonResult;
  htmlPath: string;
  summary: {
    totalDivergences: number;
    critical: number;
    warnings: number;
    info: number;
    visualMismatch: boolean;
    canFlipDns: boolean; // true if zero critical divergences
  };
}
