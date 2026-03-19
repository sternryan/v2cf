export interface ConfidenceContext {
  operations?: string[];
  isStaticPath?: boolean;
}

const AUTO_OPS = ['get', 'set', 'del', 'exists', 'expire'];
const LIST_OPS = ['lpush', 'lrange', 'rpush', 'llen'];

export function assignConfidence(
  type: string,
  context: ConfidenceContext
): 'AUTO' | 'REVIEW' | 'MANUAL' {
  switch (type) {
    case 'max-duration':
    case 'edge-runtime':
    case 'vercel-analytics':
    case 'ip-header':
      return 'AUTO';

    case 'vercel-og':
    case 'streaming-callback':
      return 'REVIEW';

    case 'vercel-kv': {
      const ops = context.operations ?? [];
      if (ops.length === 0) return 'MANUAL';
      if (ops.some((op) => LIST_OPS.includes(op))) return 'REVIEW';
      if (ops.every((op) => AUTO_OPS.includes(op))) return 'AUTO';
      return 'MANUAL';
    }

    case 'runtime-fs':
      return context.isStaticPath ? 'REVIEW' : 'MANUAL';

    default:
      return 'MANUAL';
  }
}
