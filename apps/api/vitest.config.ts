import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests load .wasm and .woff the way the production bundle does: as bytes.
const binary = {
  name: 'binary-assets',
  enforce: 'pre' as const,
  load(id: string) {
    if (!/\.(wasm|woff)$/.test(id)) return null;
    return `export default Buffer.from(${JSON.stringify(readFileSync(id).toString('base64'))}, 'base64');`;
  },
};

export default defineConfig({
  plugins: [binary],
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000, server: { deps: { inline: [/@resvg/, /@fontsource/] } } },
});
