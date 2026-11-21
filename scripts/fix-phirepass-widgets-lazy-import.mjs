import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Stencil >= 4.45.5 emits `/* turbopackIgnore: true */` on the lazy-loader's
// `import(`./${bundleId}.entry.js`)`. That stops Turbopack from bundling the
// component entry chunks, so at runtime the browser requests
// /_next/static/chunks/<tag>.entry.js, which doesn't exist (404). Strip the
// hint so Turbopack bundles the entries like it did before.
const dirs = [
  resolve('node_modules/phirepass-widgets/dist/esm'),
  resolve('node_modules/phirepass-widgets/dist/cjs'),
];

const HINT = /\/\*\s*turbopackIgnore:\s*true\s*\*\/\s*/g;
let patched = 0;

for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const file = join(dir, name);
    const src = readFileSync(file, 'utf8');
    if (!HINT.test(src)) continue;
    HINT.lastIndex = 0;
    writeFileSync(file, src.replace(HINT, ''));
    patched++;
  }
}

console.log(`[postinstall] Removed turbopackIgnore from ${patched} phirepass-widgets file(s).`);
