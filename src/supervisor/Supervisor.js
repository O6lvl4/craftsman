import { promises as fs } from 'fs';
import path from 'path';

export class Supervisor {
  constructor({ provider, dataDir }) {
    this.provider = provider;
    this.dataDir = dataDir;
    this.runtimePath = path.join(this.dataDir, 'runtime.json'); // legacy
  }

  _cartDir(id) { return path.join(this.dataDir, 'cartridges', id); }
  _cartDataDir(id) { return path.join(this._cartDir(id), 'data'); }
  _cartMetaPath(id) { return path.join(this._cartDir(id), 'cartridge.json'); }
  _runtimePath(id) { return path.join(this._cartDir(id), 'runtime.json'); }

  async _readRuntime(id) {
    if (id) {
      try { const raw = await fs.readFile(this._runtimePath(id), 'utf8'); return JSON.parse(raw); } catch { return {}; }
    }
    try {
      const raw = await fs.readFile(this.runtimePath, 'utf8');
      return JSON.parse(raw);
    } catch { return {}; }
  }

  async _writeRuntime(id, obj) {
    if (id) {
      await fs.mkdir(this._cartDir(id), { recursive: true });
      return fs.writeFile(this._runtimePath(id), JSON.stringify(obj, null, 2));
    }
    await fs.mkdir(this.dataDir, { recursive: true }); // legacy
    await fs.writeFile(this.runtimePath, JSON.stringify(obj, null, 2));
  }

  async status({ cartridgeId } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const name = `mc-${cartridgeId}`;
    const rt = await this._readRuntime(cartridgeId);
    const p = await this.provider.status(name);
    // Normalize
    return {
      id: cartridgeId,
      running: p.running,
      type: p.type || rt.type,
      version: p.version || rt.version,
      ports: p.ports || rt.ports,
      startedAt: p.startedAt || rt.startedAt,
      slot: p.level || rt.slot
    };
  }

  async statuses() {
    const root = path.join(this.dataDir, 'cartridges');
    let ids = [];
    try { ids = await fs.readdir(root); } catch { ids = []; }
    const out = [];
    for (const id of ids) {
      const stat = await this.status({ cartridgeId: id }).catch(() => null);
      if (stat) out.push(stat);
    }
    return out;
  }

  async start({ cartridgeId, slot, type, version, memory = '4G', eula = true, onlineMode = true, motd, rconEnabled = true, rconPassword } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const name = `mc-${cartridgeId}`;
    const existed = await this.provider.status(name);
    if (existed.running) {
      const err = new Error('Server is already running');
      err.code = 'ALREADY_RUNNING';
      throw err;
    }
    // resolve cartridge meta
    if (!type || !version) {
      const meta = JSON.parse(await fs.readFile(this._cartMetaPath(cartridgeId), 'utf8'));
      type = type || meta.engine?.serverType || 'paper';
      version = version || meta.engine?.version || '1.21.8';
      slot = slot || meta.activeSlot || 'world';
    } else {
      try {
        const meta = JSON.parse(await fs.readFile(this._cartMetaPath(cartridgeId), 'utf8'));
        slot = slot || meta.activeSlot || 'world';
      } catch { slot = slot || 'world'; }
    }

    const run = await this.provider.start({
      containerName: name,
      type,
      version,
      memory,
      eula,
      onlineMode,
      motd,
      rconEnabled,
      rconPassword,
      level: slot,
      mountDataDir: this._cartDataDir(cartridgeId)
    });

    await this._writeRuntime(cartridgeId, {
      containerName: name,
      type,
      version,
      slot,
      ports: run.ports,
      rcon: run.rcon,
      startedAt: run.startedAt
    });

    return run;
  }

  async stop({ cartridgeId, forceKill = false } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const name = `mc-${cartridgeId}`;
    const rt = await this._readRuntime(cartridgeId);
    const out = await this.provider.stop(name, { forceKill });
    await this._writeRuntime(cartridgeId, { ...rt, startedAt: null });
    return out;
  }

  async logs({ cartridgeId, tail = 200 } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const name = `mc-${cartridgeId}`;
    return await this.provider.logs(name, { tail });
  }
}
