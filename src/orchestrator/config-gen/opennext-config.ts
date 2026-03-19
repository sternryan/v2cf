export function generateOpenNextConfig(): string {
  return `import { defineCloudflareConfig } from "@opennextjs/cloudflare";\n\nexport default defineCloudflareConfig();\n`;
}
