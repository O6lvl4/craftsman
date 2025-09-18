#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'dist', 'cli', 'index.js');

if (!existsSync(ENTRY)) {
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: ROOT });
  if (build.status !== 0) {
    process.stderr.write('[craftsman] Failed to build CLI.\n');
    process.exit(build.status ?? 1);
  }
}

await import(ENTRY);
