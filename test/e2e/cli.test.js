import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/craftsman.js');
const TEST_DATA_DIR = path.join(__dirname, '../../tmp/e2e-cli-data');

async function runCLI(args = [], options = {}) {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      ...options,
      env: {
        ...process.env,
        ...options.env,
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

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function cleanDataDir() {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
}

describe('Craftsman CLI 2.0', () => {
  beforeEach(async () => {
    await cleanDataDir();
  });

  test('help command shows Craftsman banner', async () => {
    const result = await runCLI(['help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('CRAFTSMAN');
    expect(result.stdout.toLowerCase()).toContain('craftsman 2.0');
  });

  test('short help (-h) omits banner', async () => {
    const result = await runCLI(['-h']);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('CRAFTSMAN');
    expect(result.stdout.toLowerCase()).toContain('craftsman 2.0');
  });

  test('up creates and starts a server; status reflects it', async () => {
    const result = await runCLI(['up', 'e2e-up', '--type', 'paper', '--version', '1.21.8']);
    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain('created and started');

    const statusJson = await runCLI(['status', '--json']);
    expect(statusJson.code).toBe(0);
    const parsed = JSON.parse(statusJson.stdout);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    const entry = parsed.data.find((s) => s.id === 'e2e-up');
    expect(entry).toBeDefined();
    expect(entry.id).toBe('e2e-up');

    const stop = await runCLI(['stop']);
    expect(stop.code).toBe(0);
    expect(stop.stdout.toLowerCase()).toContain('stopped');
  });

  test('context-aware backup without specifying target', async () => {
    await runCLI(['up', 'e2e-back', '--type', 'paper']);
    const backup = await runCLI(['backup']);
    expect(backup.code).toBe(0);
    expect(backup.stdout.toLowerCase()).toContain('backup created');
    await runCLI(['stop']);
  });

  test('delete removes server with --force in non-interactive mode', async () => {
    await runCLI(['up', 'e2e-delete', '--type', 'paper']);
    await runCLI(['stop', 'e2e-delete']);
    const del = await runCLI(['delete', 'e2e-delete', '--force', '--quiet']);
    expect(del.code).toBe(0);
    const status = await runCLI(['status', '--json']);
    const parsed = JSON.parse(status.stdout);
    const entry = parsed.data.find((s) => s.id === 'e2e-delete');
    expect(entry).toBeUndefined();
  });
});
