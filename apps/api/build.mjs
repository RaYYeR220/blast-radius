// Writes the Vercel Build Output (v3): the built web app as static files, and each
// API route bundled into a single ESM file so it carries every dependency with it.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../.vercel/output');
const web = resolve(here, '../web/dist');
const ROUTES = ['runs', 'seed', 'leaderboard', 'run', 'agent', 'mcp', 'share'];

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'static'), { recursive: true });
if (!process.argv.includes('--skip-web')) {
  if (!existsSync(web)) throw new Error('build the web app first (pnpm --filter web build)');
  cpSync(web, resolve(out, 'static'), { recursive: true });
}

for (const route of ROUTES) {
  const dir = resolve(out, `functions/api/${route}.func`);
  mkdirSync(dir, { recursive: true });
  await build({
    stdin: {
      contents: `import handler from './src/routes/${route}.ts';\nimport { toNode } from './src/node.ts';\nexport default toNode(handler);\n`,
      resolveDir: here,
      loader: 'ts',
      sourcefile: `${route}-entry.ts`,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: resolve(dir, 'index.mjs'),
    legalComments: 'none',
    minify: true,
    // some dependencies still call require() for Node built-ins
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });
  writeFileSync(
    resolve(dir, '.vc-config.json'),
    JSON.stringify({
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 30,
    }),
  );
}

writeFileSync(
  resolve(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/agent/(start|observe|act|submit)/?$', dest: '/api/agent?op=$1' },
        { src: '^/r/([0-9a-fA-F-]{36})/?$', dest: '/api/share?id=$1' },
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
      ],
    },
    null,
    2,
  ),
);
console.log(`build output: ${ROUTES.length} functions${process.argv.includes('--skip-web') ? '' : ' + static'}`);
