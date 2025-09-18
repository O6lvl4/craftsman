import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/craftsman.js');
const TEST_DATA_DIR = path.join(__dirname, '../../tmp/e2e-pak-data');

async function runCLI(args = []) {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: {
        ...process.env,
        CRAFTSMAN_DATA_DIR: TEST_DATA_DIR,
        CRAFTSMAN_PROVIDER: 'local',
        PROVIDER: 'local'
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
  });
}

async function cleanDir() {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
}

describe('Craftsman workflow commands', () => {
  beforeEach(async () => {
    await cleanDir();
  });

  test('argument reordering works for up command', async () => {
    const result = await runCLI(['up', '1.21.8', 'e2e-order', 'paper']);
    expect(result.code).toBe(0);
    const metaPath = path.join(TEST_DATA_DIR, 'paks', 'e2e-order', 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    expect(meta.engine.serverType).toBe('paper');
    expect(meta.engine.version).toBe('1.21.8');
    await runCLI(['stop', 'e2e-order']);
  });

  test('clone duplicates metadata to new server', async () => {
    await runCLI(['up', 'e2e-src', '--type', 'paper']);
    await runCLI(['stop', 'e2e-src']);
    const clone = await runCLI(['clone', 'e2e-src', 'e2e-dest']);
    expect(clone.code).toBe(0);

    const cloneMetaPath = path.join(TEST_DATA_DIR, 'paks', 'e2e-dest', 'pak.json');
    const exists = await fs.access(cloneMetaPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    const meta = JSON.parse(await fs.readFile(cloneMetaPath, 'utf8'));
    expect(meta.id).toBe('e2e-dest');
  });

  test('upgrade updates engine version with backup', async () => {
    await runCLI(['up', 'e2e-upgrade', '--type', 'paper', '--version', '1.21.8']);
    const upgrade = await runCLI(['upgrade', 'e2e-upgrade', '--version', '1.21.9']);
    expect(upgrade.code).toBe(0);
    expect(upgrade.stdout.toLowerCase()).toContain('upgraded e2e-upgrade');

    const metaPath = path.join(TEST_DATA_DIR, 'paks', 'e2e-upgrade', 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    expect(meta.engine.version).toBe('1.21.9');
    await runCLI(['stop', 'e2e-upgrade']);
  });
});
