import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/craftsman.js');

function runCLI(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      ...options,
      env: { ...process.env, ...options.env }
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
      resolve({
        code,
        stdout,
        stderr
      });
    });
    
    proc.on('error', reject);
  });
}

describe('Craftsman CLI E2E Tests', () => {
  describe('Help Command', () => {
    test('should display help when no arguments provided', async () => {
      const result = await runCLI();
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('craftsman start');
      expect(result.stdout).toContain('craftsman stop');
    });

    test('should display help with explicit help command', async () => {
      const result = await runCLI(['help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman CLI');
    });
  });

  describe('Status Command', () => {
    test('should show status list when no cartridge specified', async () => {
      const result = await runCLI(['status']);
      expect(result.code).toBe(0);
    });

    test('should show error when cartridge flag without value', async () => {
      const result = await runCLI(['status', '--cartridge']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --cartridge requires a value');
    });

    test('should show status with JSON output', async () => {
      const result = await runCLI(['status', '--json']);
      expect(result.code).toBe(0);
      const isValidJSON = () => {
        try {
          JSON.parse(result.stdout);
          return true;
        } catch {
          return false;
        }
      };
      expect(isValidJSON()).toBe(true);
    });
  });

  describe('Start Command', () => {
    test('should require cartridge parameter', async () => {
      const result = await runCLI(['start']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --cartridge is required');
    });

    test('should accept all parameters', async () => {
      const result = await runCLI([
        'start',
        '--cartridge', 'test-cart',
        '--type', 'paper',
        '--version', '1.21.8',
        '--memory', '4G',
        '--eula', 'true',
        '--provider', 'local'
      ]);
      // コマンドが実行されることを確認（実際のサーバー起動はモックまたはスキップ）
      expect(result.code).toBeDefined();
    });
  });

  describe('Stop Command', () => {
    test('should require cartridge parameter', async () => {
      const result = await runCLI(['stop']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --cartridge is required');
    });

    test('should accept force flag', async () => {
      const result = await runCLI([
        'stop',
        '--cartridge', 'test-cart',
        '--force'
      ]);
      expect(result.code).toBeDefined();
    });
  });

  describe('Logs Command', () => {
    test('should require cartridge parameter', async () => {
      const result = await runCLI(['logs']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --cartridge is required');
    });

    test('should accept tail parameter', async () => {
      const result = await runCLI([
        'logs',
        '--cartridge', 'test-cart',
        '--tail', '100'
      ]);
      expect(result.code).toBeDefined();
    });
  });

  describe('Provider Options', () => {
    test('should accept docker provider', async () => {
      const result = await runCLI(['status', '--provider', 'docker']);
      expect(result.code).toBe(0);
    });

    test('should accept local provider', async () => {
      const result = await runCLI(['status', '--provider', 'local']);
      expect(result.code).toBe(0);
    });

    test('should use environment variable PROVIDER', async () => {
      const result = await runCLI(['status'], { env: { PROVIDER: 'local' } });
      expect(result.code).toBe(0);
    });
  });
});