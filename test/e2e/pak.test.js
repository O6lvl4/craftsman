import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/craftsman.js');
const DATA_DIR = path.join(__dirname, '../../data');
const TEST_PAK_DIR = path.join(DATA_DIR, 'paks', 'test-e2e-cart');

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

describe('Pak Operations E2E Tests', () => {
  beforeEach(async () => {
    // クリーンアップ: テスト用Pakを削除
    try {
      await fs.rm(TEST_PAK_DIR, { recursive: true, force: true });
    } catch (e) {
      // ディレクトリが存在しない場合は無視
    }
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    try {
      await fs.rm(TEST_PAK_DIR, { recursive: true, force: true });
    } catch (e) {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('Pak Help', () => {
    test('should display pak help', async () => {
      const result = await runCLI(['pak']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman Pak');
      expect(result.stdout).toContain('pak create');
      expect(result.stdout).toContain('pak list');
      expect(result.stdout).toContain('pak save');
    });

    test('should display pak help with help subcommand', async () => {
      const result = await runCLI(['pak', 'help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Craftsman Pak');
    });
  });

  describe('Pak Create', () => {
    test('should create a new pak', async () => {
      const result = await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8',
        '--name', 'Test E2E Pak'
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('test-e2e-cart');
      
      // Pak ディレクトリが作成されていることを確認
      const exists = await fs.access(TEST_PAK_DIR).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // pak.jsonが作成されていることを確認
      const metaPath = path.join(TEST_PAK_DIR, 'pak.json');
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
      expect(metaExists).toBe(true);
    });

    test('should create pak with JSON output', async () => {
      const result = await runCLI([
        'pak', 'create',
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

  describe('Pak List', () => {
    beforeEach(async () => {
      // テスト用Pakを作成
      await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should list paks', async () => {
      const result = await runCLI(['pak', 'list']);
      expect(result.code).toBe(0);
    });

    test('should list paks with JSON output', async () => {
      const result = await runCLI(['pak', 'list', '--json']);
      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      const testPak = json.find(c => c.id === 'test-e2e-cart');
      expect(testPak).toBeDefined();
      expect(testPak.type).toBe('paper');
    });
  });

  describe('Pak Save', () => {
    beforeEach(async () => {
      // テスト用Pakを作成
      await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should save pak slot', async () => {
      const result = await runCLI([
        'pak', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      expect(result.code).toBe(0);
      
      // data/test-slotディレクトリが作成されることを確認
      const savePath = path.join(TEST_PAK_DIR, 'data', 'test-slot');
      const exists = await fs.access(savePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Pak Set Active', () => {
    beforeEach(async () => {
      // テスト用Pakを作成
      await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
      // スロットを保存
      await runCLI([
        'pak', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
    });

    test('should set active slot', async () => {
      const result = await runCLI([
        'pak', 'set-active',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      expect(result.code).toBe(0);
      
      // JSONで確認
      const resultJson = await runCLI([
        'pak', 'set-active',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot',
        '--json'
      ]);
      const json = JSON.parse(resultJson.stdout);
      expect(json.activeSlot).toBe('test-slot');
    });
  });

  describe('Pak Insert', () => {
    beforeEach(async () => {
      // テスト用Pakを作成
      await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should insert pak', async () => {
      const result = await runCLI([
        'pak', 'insert',
        '--id', 'test-e2e-cart',
        '--force'
      ]);
      expect(result.code).toBe(0);
      
      // runtime.jsonが作成されることを確認
      const runtimePath = path.join(DATA_DIR, 'runtime.json');
      const exists = await fs.access(runtimePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should insert pak with specific slot', async () => {
      // スロットを作成
      await runCLI([
        'pak', 'save',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot'
      ]);
      
      const result = await runCLI([
        'pak', 'insert',
        '--id', 'test-e2e-cart',
        '--slot', 'test-slot',
        '--force'
      ]);
      expect(result.code).toBe(0);
    });
  });

  describe('Pak Extension Operations', () => {
    beforeEach(async () => {
      // テスト用Pakを作成
      await runCLI([
        'pak', 'create',
        '--id', 'test-e2e-cart',
        '--type', 'paper',
        '--version', '1.21.8'
      ]);
    });

    test('should display extension help', async () => {
      const result = await runCLI(['pak', 'extension']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('pak extension list');
      expect(result.stdout).toContain('pak extension add');
    });

    test('should list extensions (empty initially)', async () => {
      const result = await runCLI([
        'pak', 'extension', 'list',
        '--id', 'test-e2e-cart'
      ]);
      expect(result.code).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(0);
    });

    test('should require id for extension list', async () => {
      const result = await runCLI(['pak', 'extension', 'list']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Error: --id <pakId> is required');
    });

    test('should handle extension add parameters', async () => {
      const result = await runCLI(['pak', 'extension', 'add']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('pak extension add');
      expect(result.stdout).toContain('--store');
      expect(result.stdout).toContain('--project');
    });

    test('should handle extension update parameters', async () => {
      const result = await runCLI(['pak', 'extension', 'update']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('pak extension update');
    });

    test('should handle extension remove parameters', async () => {
      const result = await runCLI(['pak', 'extension', 'remove']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('pak extension remove');
    });
  });
});