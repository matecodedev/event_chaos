#!/usr/bin/env node
/**
 * Fails the build when the published output grows past its budget.
 *
 * This project once shipped a 19 MB dist because a 3 MB portrait was rendered
 * into a 40x40 box. Budgets are deliberately loose: they are here to catch that
 * class of mistake, not to police a few kilobytes.
 */
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');

const BUDGETS = {
  totalBytes: 4 * 1024 * 1024,
  singleAssetBytes: 512 * 1024,
  jsGzipBytes: 200 * 1024,
  cssGzipBytes: 40 * 1024
};

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      const { size } = await stat(full);
      return [{ path: path.relative(DIST, full), size }];
    })
  );
  return files.flat();
};

const gzipSizeOf = async (files, extension) => {
  const match = files.find((file) => file.path.endsWith(extension));
  if (!match) return null;
  const content = await readFile(path.join(DIST, match.path));
  return { path: match.path, size: gzipSync(content).length };
};

const main = async () => {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const files = await walk(DIST);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const largest = [...files].sort((a, b) => b.size - a.size)[0];
  const js = await gzipSizeOf(files, '.js');
  const css = await gzipSizeOf(files, '.css');

  const failures = [];

  const check = (label, actual, budget, detail = '') => {
    const ok = actual <= budget;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(26)} ${formatKb(actual).padStart(11)}  (budget ${formatKb(budget)})${detail}`
    );
    if (!ok) failures.push(`${label}: ${formatKb(actual)} exceeds ${formatKb(budget)}`);
  };

  console.log(`\nBundle budget — ${files.length} files in dist/\n`);
  check('total output', totalBytes, BUDGETS.totalBytes);
  check('largest single asset', largest.size, BUDGETS.singleAssetBytes, `  ${largest.path}`);
  if (js) check('js (gzip)', js.size, BUDGETS.jsGzipBytes);
  if (css) check('css (gzip)', css.size, BUDGETS.cssGzipBytes);

  if (failures.length > 0) {
    console.error(`\nBundle budget exceeded:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
    process.exit(1);
  }

  console.log('\nAll budgets met.\n');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
