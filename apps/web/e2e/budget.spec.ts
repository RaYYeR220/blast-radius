import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

test('initial JavaScript stays under 300 KB gzipped', ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'one check is enough');
  const dir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
  const total = readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .reduce((n, f) => n + gzipSync(readFileSync(dir + f)).length, 0);
  expect(total).toBeLessThan(300 * 1024);
});
