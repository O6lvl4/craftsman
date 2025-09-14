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
      saves: { active: '', slots: [] },
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(dir, 'cartridge.json'), JSON.stringify(meta, null, 2));
    await ensureDir(path.join(dir, 'saves'));
    return meta;
  }

  async saveFromCurrent({ id, slot }) {
    if (!id || !slot) throw new Error('id and slot are required');
    const dir = path.join(this.cartsDir, id);
    const metaPath = path.join(dir, 'cartridge.json');
    const savesDir = path.join(dir, 'saves');
    if (!(await exists(metaPath))) throw new Error('cartridge not found');
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    const slotDir = path.join(savesDir, slot);
    await rmrf(slotDir);
    await ensureDir(slotDir);
    // copy host /data world directories into slot
    const w = path.join(this.dataDir, 'world');
    const wn = path.join(this.dataDir, 'world_nether');
    const we = path.join(this.dataDir, 'world_the_end');
    if (await exists(w)) await copyDir(w, path.join(slotDir, 'world'));
    if (await exists(wn)) await copyDir(wn, path.join(slotDir, 'world_nether'));
    if (await exists(we)) await copyDir(we, path.join(slotDir, 'world_the_end'));
    // update metadata
    const slots = meta.saves.slots.filter(s => s.id !== slot);
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
    // write server-spec (used by Supervisor.start if type/version omitted)
    const spec = { type: meta.engine.serverType, version: meta.engine.version, cartridgeId: id, slot: slot || meta.saves.active || '' };
    await fs.writeFile(this.specPath, JSON.stringify(spec, null, 2));
    // apply world slot to /data
    const useSlot = slot || meta.saves.active;
    if (useSlot) {
      const slotDir = path.join(dir, 'saves', useSlot);
      if (!(await exists(slotDir))) throw new Error(`slot not found: ${useSlot}`);
      const w = path.join(this.dataDir, 'world');
      const wn = path.join(this.dataDir, 'world_nether');
      const we = path.join(this.dataDir, 'world_the_end');
      await rmrf(w); await rmrf(wn); await rmrf(we);
      if (await exists(path.join(slotDir, 'world'))) await copyDir(path.join(slotDir, 'world'), w);
      if (await exists(path.join(slotDir, 'world_nether'))) await copyDir(path.join(slotDir, 'world_nether'), wn);
      if (await exists(path.join(slotDir, 'world_the_end'))) await copyDir(path.join(slotDir, 'world_the_end'), we);
    }
    // update active slot
    if (slot) {
      meta.saves.active = slot;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    return { applied: true, spec };
  }
}

