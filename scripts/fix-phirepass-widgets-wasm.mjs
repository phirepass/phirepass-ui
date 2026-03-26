import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourceCandidates = [
  // Prefer the wasm that is version-matched with phirepass-widgets' bundled JS glue.
  resolve('node_modules/phirepass-widgets/node_modules/phirepass-channel/phirepass-channel_bg.wasm'),
  // Fallback for flat installs where the nested dependency is hoisted.
  resolve('node_modules/phirepass-channel/phirepass-channel_bg.wasm'),
];

const source = sourceCandidates.find((candidate) => existsSync(candidate));

const targets = [
  resolve('node_modules/phirepass-widgets/dist/esm/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/components/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/collection/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/phirepass-widgets/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/cjs/phirepass-channel_bg.wasm'),
];

if (!source) {
  console.warn('[postinstall] Skipping phirepass-widgets wasm fix: source wasm not found.');
  process.exit(0);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

console.log(`[postinstall] Copied phirepass-channel_bg.wasm from ${source} into phirepass-widgets dist folders.`);
