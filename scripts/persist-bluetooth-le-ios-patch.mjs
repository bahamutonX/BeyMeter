import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(
  process.cwd(),
  'patches/capacitor-community-bluetooth-le/ios/Sources/BluetoothLe/Plugin.swift'
);

const target = resolve(
  process.cwd(),
  'node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/Plugin.swift'
);

if (!existsSync(source)) {
  console.warn('[bluetooth-le-patch] source patch file not found, skipping.');
  process.exit(0);
}

if (!existsSync(target)) {
  console.warn('[bluetooth-le-patch] plugin file not found in node_modules, skipping.');
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('[bluetooth-le-patch] Applied iOS compatibility patch to Plugin.swift');
