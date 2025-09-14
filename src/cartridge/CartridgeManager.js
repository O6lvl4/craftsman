import { promises as fs } from 'fs';
import path from 'path';

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function rmrf(p) { await fs.rm(p, { recursive: true, force: true }); }

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

export class CartridgeManager {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.cartsDir = path.join(this.dataDir, 'cartridges');
    this.specPath = path.join(this.dataDir, 'server-spec.json');
  }

  async list() {
    const list = [];
    await ensureDir(this.cartsDir);
    const ids = await fs.readdir(this.cartsDir).catch(() => []);
    for (const id of ids) {
      const metaPath = path.join(this.cartsDir, id, 'cartridge.json');
      if (!(await exists(metaPath))) continue;
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw);
      list.push(meta);
    }
    return list;
  }

  async create({ id, type, version, name }) {
    if (!id || !type || !version) throw new Error('id, type, version are required');
    const dir = path.join(this.cartsDir, id);
    await ensureDir(dir);
    const meta = {
      id,
      name: name || id,
      engine: { serverType: type, version },
      activeSlot: '',
      saves: { slots: [] },
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(dir, 'cartridge.json'), JSON.stringify(meta, null, 2));
    await ensureDir(path.join(dir, 'data'));
    return meta;
  }

  async saveFromCurrent({ id, slot }) {
    if (!id || !slot) throw new Error('id and slot are required');
    const dir = path.join(this.cartsDir, id);
    const metaPath = path.join(dir, 'cartridge.json');
    const savesDir = path.join(dir, 'data');
    if (!(await exists(metaPath))) throw new Error('cartridge not found');
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    const slotDir = path.join(savesDir, slot);
    await rmrf(slotDir);
    await ensureDir(slotDir);
    // 新方式: スロット=ワールドルート（LEVEL=slot で参照される）
    // 旧 /data/world* から slot/ へコピー（移行用）
    const w = path.join(this.dataDir, 'world');
    if (await exists(w)) await copyDir(w, slotDir);
    // update metadata
    const slots = (meta.saves.slots || []).filter(s => s.id !== slot);
    slots.push({ id: slot, name: slot, created: new Date().toISOString() });
    meta.saves.slots = slots;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return { id, slot };
  }

  async insert({ id, slot, force = false }) {
    if (!id) throw new Error('id is required');
    const dir = path.join(this.cartsDir, id);
    const metaPath = path.join(dir, 'cartridge.json');
    if (!(await exists(metaPath))) throw new Error('cartridge not found');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    // 新方式: activeSlot のみ更新。LEVEL は起動時に適用。
    if (slot) {
      const slotDir = path.join(dir, 'data', slot);
      if (!(await exists(slotDir))) throw new Error(`slot not found: ${slot}`);
      meta.activeSlot = slot;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    const spec = { type: meta.engine.serverType, version: meta.engine.version, cartridgeId: id, slot: slot || meta.activeSlot || '' };
    return { applied: true, spec };
  }

  async setActive({ id, slot }) {
    if (!id || !slot) throw new Error('id and slot are required');
    const metaPath = path.join(this.cartsDir, id, 'cartridge.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    const slotDir = path.join(this.cartsDir, id, 'data', slot);
    if (!(await exists(slotDir))) throw new Error(`slot not found: ${slot}`);
    meta.activeSlot = slot;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }
}
