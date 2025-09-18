import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import path from 'path';

export type PakEngineType = 'paper' | 'fabric' | 'neoforge' | string;

export interface PakExtension {
  store: string;
  projectId: string | number;
  versionId: string | number;
  filename: string;
}

export interface PakSlot {
  id: string;
  name: string;
  created: string;
}

export interface PakMetadata {
  id: string;
  name: string;
  engine: {
    serverType: PakEngineType;
    version: string;
  };
  activeSlot: string;
  saves: {
    slots: PakSlot[];
  };
  extensions: PakExtension[];
  createdAt: string;
  [key: string]: unknown;
}

export interface PakInsertResult {
  applied: boolean;
  spec: {
    type: PakEngineType;
    version: string;
    pakId: string;
    slot: string;
  };
}

interface EnsureDirOptions {
  recursive?: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string, options: EnsureDirOptions = { recursive: true }): Promise<void> {
  await fs.mkdir(p, options);
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  const tasks = entries.map(async (entry: Dirent) => {
    const source = path.join(src, entry.name);
    const target = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  });
  await Promise.all(tasks);
}

export class PakManager {
  private readonly dataDir: string;

  private readonly paksDir: string;

  private readonly specPath: string;

  constructor({ dataDir }: { dataDir: string }) {
    this.dataDir = dataDir;
    this.paksDir = path.join(this.dataDir, 'paks');
    this.specPath = path.join(this.dataDir, 'server-spec.json');
  }

  async list(): Promise<PakMetadata[]> {
    const list: PakMetadata[] = [];
    await ensureDir(this.paksDir);
    const ids = await fs.readdir(this.paksDir).catch(() => [] as string[]);
    for (const id of ids) {
      const metaPath = path.join(this.paksDir, id, 'pak.json');
      if (!(await exists(metaPath))) continue;
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as PakMetadata;
      list.push(meta);
    }
    return list;
  }

  async create({ id, type, version, name }: { id: string; type: PakEngineType; version: string; name?: string }): Promise<PakMetadata> {
    if (!id || !type || !version) throw new Error('id, type, version are required');
    const dir = path.join(this.paksDir, id);
    await ensureDir(dir);
    const meta: PakMetadata = {
      id,
      name: name || id,
      engine: { serverType: type, version },
      activeSlot: 'world',
      saves: { slots: [] },
      extensions: [],
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(dir, 'pak.json'), JSON.stringify(meta, null, 2));
    await ensureDir(path.join(dir, 'data', 'world'));
    return meta;
  }

  async remove({ id }: { id: string }): Promise<{ removed: boolean; id: string }> {
    if (!id) throw new Error('id is required');
    const dir = path.join(this.paksDir, id);
    if (!(await exists(dir))) throw new Error('pak not found');
    await rmrf(dir);
    return { removed: true, id };
  }

  async saveFromCurrent({ id, slot }: { id: string; slot: string }): Promise<{ id: string; slot: string }> {
    if (!id || !slot) throw new Error('id and slot are required');
    const dir = path.join(this.paksDir, id);
    const metaPath = path.join(dir, 'pak.json');
    const savesDir = path.join(dir, 'data');
    if (!(await exists(metaPath))) throw new Error('pak not found');
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw) as PakMetadata;
    const slotDir = path.join(savesDir, slot);
    await rmrf(slotDir);
    await ensureDir(slotDir);
    const worldDir = path.join(this.dataDir, 'world');
    if (await exists(worldDir)) await copyDir(worldDir, slotDir);
    const slots = (meta.saves.slots || []).filter((s) => s.id !== slot);
    slots.push({ id: slot, name: slot, created: new Date().toISOString() });
    meta.saves.slots = slots;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return { id, slot };
  }

  async insert({ id, slot }: { id: string; slot?: string; force?: boolean }): Promise<PakInsertResult> {
    if (!id) throw new Error('id is required');
    const dir = path.join(this.paksDir, id);
    const metaPath = path.join(dir, 'pak.json');
    if (!(await exists(metaPath))) throw new Error('pak not found');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    if (slot) {
      const slotDir = path.join(dir, 'data', slot);
      if (!(await exists(slotDir))) throw new Error(`slot not found: ${slot}`);
      meta.activeSlot = slot;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    const spec: PakInsertResult['spec'] = {
      type: meta.engine.serverType,
      version: meta.engine.version,
      pakId: id,
      slot: slot || meta.activeSlot || ''
    };
    return { applied: true, spec };
  }

  async addExtension(args: PakExtension & { id: string }): Promise<PakExtension[]> {
    const { id, store, projectId, versionId, filename } = args;
    if (!id || !store || !projectId || !versionId || !filename) {
      throw new Error('id, store, projectId, versionId, filename are required');
    }
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    const deps = (meta.extensions || []).filter((d) => !(d.store === store && d.projectId === projectId));
    deps.push({ store, projectId, versionId, filename });
    meta.extensions = deps;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return deps;
  }

  async listExtensions({ id }: { id: string }): Promise<PakExtension[]> {
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    return meta.extensions || [];
  }

  async updateExtension(args: PakExtension & { id: string }): Promise<PakExtension> {
    const { id, store, projectId, versionId, filename } = args;
    if (!id || !store || !projectId || !versionId || !filename) {
      throw new Error('id, store, projectId, versionId, filename are required');
    }
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    const exts = meta.extensions || [];
    const idx = exts.findIndex((d) => d.store === store && d.projectId === projectId);
    if (idx === -1) throw new Error('extension not found');
    exts[idx] = { store, projectId, versionId, filename };
    meta.extensions = exts;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return exts[idx];
  }

  async removeExtension({ id, store, projectId }: { id: string; store: string; projectId: string | number }): Promise<{ removed: number }> {
    if (!id || !store || !projectId) throw new Error('id, store, projectId are required');
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    const before = (meta.extensions || []).length;
    meta.extensions = (meta.extensions || []).filter((d) => !(d.store === store && d.projectId === projectId));
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return { removed: before - (meta.extensions || []).length };
  }

  async setActive({ id, slot }: { id: string; slot: string }): Promise<PakMetadata> {
    if (!id || !slot) throw new Error('id and slot are required');
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as PakMetadata;
    const slotDir = path.join(this.paksDir, id, 'data', slot);
    if (!(await exists(slotDir))) throw new Error(`slot not found: ${slot}`);
    meta.activeSlot = slot;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }

  async readMetadata(id: string): Promise<PakMetadata> {
    const metaPath = path.join(this.paksDir, id, 'pak.json');
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw) as PakMetadata;
  }

  async writeMetadata(id: string, meta: PakMetadata): Promise<void> {
    const dir = path.join(this.paksDir, id);
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, 'pak.json'), JSON.stringify(meta, null, 2));
  }
}
