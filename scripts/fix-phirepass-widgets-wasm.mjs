import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve('node_modules/phirepass-channel/phirepass-channel_bg.wasm');

const targets = [
  resolve('node_modules/phirepass-widgets/dist/esm/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/components/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/phirepass-widgets/phirepass-channel_bg.wasm'),
  resolve('node_modules/phirepass-widgets/dist/cjs/phirepass-channel_bg.wasm'),
];

if (!existsSync(source)) {
  console.warn('[postinstall] Skipping phirepass-widgets wasm fix: source wasm not found.');
  process.exit(0);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

console.log('[postinstall] Copied phirepass-channel_bg.wasm into phirepass-widgets dist folders.');
