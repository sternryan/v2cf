import { describe, it, expect } from 'vitest';
import { generateOpenNextConfig } from '../../src/orchestrator/config-gen/opennext-config.js';

describe('generateOpenNextConfig', () => {
  it('returns string containing defineCloudflareConfig import', () => {
    const result = generateOpenNextConfig();
    expect(result).toContain(
      'import { defineCloudflareConfig } from "@opennextjs/cloudflare"'
    );
  });

  it('returns string containing export default defineCloudflareConfig()', () => {
    const result = generateOpenNextConfig();
    expect(result).toContain('export default defineCloudflareConfig()');
  });

  it('returns a complete, valid module string', () => {
    const result = generateOpenNextConfig();
    expect(result).toMatch(/^import.*\n\nexport default.*\n$/);
  });
});
