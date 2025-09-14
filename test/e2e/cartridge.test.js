import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/craftsman.js');
const DATA_DIR = path.join(__dirname, '../../data');
const TEST_CARTRIDGE_DIR = path.join(DATA_DIR, 'cartridges', 'test-e2e-cart');

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

describe('Cartridge Operations E2E Tests', () => {
  beforeEach(async () => {
    // クリーンアップ: テスト用カートリッジを削除
    try {
      await fs.rm(TEST_CARTRIDGE_DIR, { recursive: true, force: true });
    } catch (e) {
      // ディレクトリが存在しない場合は無視
    }
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    try {
      await fs.rm(TEST_CARTRIDGE_DIR, { recursive: true, force: true });
    } catch (e) {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('Cartridge Help', () => {
    test('should display cartridge help', async () => {
      const result = await runCLI(['cartridge']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman Cartridge');
      expect(result.stdout).toContain('cartridge create');
      expect(result.stdout).toContain('cartridge list');
      expect(result.stdout).toContain('cartridge save');
    });

    test('should display cartridge help with help subcommand', async () => {
      const result = await runCLI(['cartridge', 'help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman Cartridge');
    });
  });

  describe('Cartridge Create', () => {
    test('should create a new cartridge', async () => {
      const result = await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8',
        '--name', 'Test E2E Cartridge'
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('test-e2e-cart');
      
      // カートリッジディレクトリが作成されていることを確認
      const exists = await fs.access(TEST_CARTRIDGE_DIR).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // cartridge.jsonが作成されていることを確認
      const metaPath = path.join(TEST_CARTRIDGE_DIR, 'cartridge.json');
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
      expect(metaExists).toBe(true);
    });

    test('should create cartridge with JSON output', async () => {
      const result = await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8',
        '--json'
      ]);
      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.created).toBe('test-e2e-cart');
      expect(json.type).toBe('paper');
      expect(json.version).toBe('1.21.8');
    });
  });

  describe('Cartridge List', () => {
    beforeEach(async () => {
      // テスト用カートリッジを作成
      await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should list cartridges', async () => {
      const result = await runCLI(['cartridge', 'list']);
      expect(result.code).toBe(0);
    });

    test('should list cartridges with JSON output', async () => {
      const result = await runCLI(['cartridge', 'list', '--json']);
      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      const testCart = json.find(c => c.id === 'test-e2e-cart');
      expect(testCart).toBeDefined();
      expect(testCart.type).toBe('paper');
    });
  });

  describe('Cartridge Save', () => {
    beforeEach(async () => {
      // テスト用カートリッジを作成
      await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should save cartridge slot', async () => {
      const result = await runCLI([
        'cartridge', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      expect(result.code).toBe(0);
      
      // saves/test-slotディレクトリが作成されることを確認
      const savePath = path.join(TEST_CARTRIDGE_DIR, 'saves', 'test-slot');
      const exists = await fs.access(savePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Cartridge Set Active', () => {
    beforeEach(async () => {
      // テスト用カートリッジを作成
      await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
      // スロットを保存
      await runCLI([
        'cartridge', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
    });

    test('should set active slot', async () => {
      const result = await runCLI([
        'cartridge', 'set-active',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      expect(result.code).toBe(0);
      
      // JSONで確認
      const resultJson = await runCLI([
        'cartridge', 'set-active',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot',
        '--json'
      ]);
      const json = JSON.parse(resultJson.stdout);
      expect(json.activeSlot).toBe('test-slot');
    });
  });

  describe('Cartridge Insert', () => {
    beforeEach(async () => {
      // テスト用カートリッジを作成
      await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should insert cartridge', async () => {
      const result = await runCLI([
        'cartridge', 'insert',
        '--id', 'test-e2e-cart',
        '--force'
      ]);
      expect(result.code).toBe(0);
      
      // runtime.jsonが作成されることを確認
      const runtimePath = path.join(DATA_DIR, 'runtime.json');
      const exists = await fs.access(runtimePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should insert cartridge with specific slot', async () => {
      // スロットを作成
      await runCLI([
        'cartridge', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      
      const result = await runCLI([
        'cartridge', 'insert',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot',
        '--force'
      ]);
      expect(result.code).toBe(0);
    });
  });

  describe('Cartridge Extension Operations', () => {
    beforeEach(async () => {
      // テスト用カートリッジを作成
      await runCLI([
        'cartridge', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should display extension help', async () => {
      const result = await runCLI(['cartridge', 'extension']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('cartridge extension list');
      expect(result.stdout).toContain('cartridge extension add');
    });

    test('should list extensions (empty initially)', async () => {
      const result = await runCLI([
        'cartridge', 'extension', 'list',
        '--id', 'test-e2e-cart'
      ]);
      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(0);
    });

    test('should require id for extension list', async () => {
      const result = await runCLI(['cartridge', 'extension', 'list']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --id <cartridgeId> is required');
    });

    test('should handle extension add parameters', async () => {
      const result = await runCLI(['cartridge', 'extension', 'add']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('cartridge extension add');
      expect(result.stdout).toContain('--store');
      expect(result.stdout).toContain('--project');
    });

    test('should handle extension update parameters', async () => {
      const result = await runCLI(['cartridge', 'extension', 'update']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('cartridge extension update');
    });

    test('should handle extension remove parameters', async () => {
      const result = await runCLI(['cartridge', 'extension', 'remove']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('cartridge extension remove');
    });
  });
});