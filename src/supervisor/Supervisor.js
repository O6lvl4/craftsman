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

    // 拡張（プラグイン/Mod）を適用（冪等）
    await this._applyExtensions({ cartridgeId, type });

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

  async _applyExtensions({ cartridgeId, type }) {
    // カセットの依存拡張をユーザーストレージから data/ に同期する
    // Paper: /data/plugins, Fabric/NeoForge: /data/mods
    const base = this._cartDataDir(cartridgeId);
    const dest = path.join(base, type === 'paper' ? 'plugins' : 'mods');
    await fs.mkdir(dest, { recursive: true });
    // 既存の適用済み（craftsman 管理）を除去
    const manifestPath = path.join(base, '.craftsman-ext.json');
    let prev = [];
    try { prev = JSON.parse(await fs.readFile(manifestPath, 'utf8')).files || []; } catch {}
    for (const f of prev) {
      try { await fs.unlink(path.join(base, f)); } catch {}
    }
    // 依存を取得
    const meta = JSON.parse(await fs.readFile(this._cartMetaPath(cartridgeId), 'utf8'));
    const deps = meta.extensions || [];
    const applied = [];
    for (const d of deps) {
      // ユーザーストレージ: ~/.craftsman/extensions/<store>/<projectId>/<versionId>/<filename>
      const userBase = process.env.CRAFTSMAN_EXT_HOME || path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.craftsman', 'extensions');
      const src = path.join(userBase, d.store, String(d.projectId), String(d.versionId), d.filename);
      const dst = path.join(dest, d.filename);
      try {
        await fs.copyFile(src, dst);
        applied.push(path.relative(base, dst));
      } catch (e) {
        throw new Error(`Extension not found: ${src}`);
      }
    }
    await fs.writeFile(manifestPath, JSON.stringify({ files: applied }, null, 2));
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

  async backup({ cartridgeId, name } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const startedAt = Date.now();
    const meta = JSON.parse(await fs.readFile(this._cartMetaPath(cartridgeId), 'utf8'));
    const rt = await this._readRuntime(cartridgeId);
    const slot = rt.slot || meta.activeSlot || 'world';
    const containerName = `mc-${cartridgeId}`;
    const backupsDir = path.join(this._cartDir(cartridgeId), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
    const base = name || `backup-${stamp}`;
    const file = path.join(backupsDir, `${base}.tgz`);

    // Online backup: try RCON flush cycle
    await this.provider.rcon(containerName, 'save-off').catch(()=>({ok:false}));
    await this.provider.rcon(containerName, 'save-all flush').catch(()=>({ok:false}));
    await new Promise(r => setTimeout(r, 1000));

    // Build tar of level directories
    const dataDir = this._cartDataDir(cartridgeId);
    const entries = [slot, `${slot}_nether`, `${slot}_the_end`];
    const fsEntries = [];
    for (const e of entries) {
      try { await fs.access(path.join(dataDir, e)); fsEntries.push(e); } catch {}
    }
    if (fsEntries.length === 0) throw new Error('No level directories found to backup');

    const { exec: execCb } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execCb);
    await exec(`tar czf ${JSON.stringify(file)} -C ${JSON.stringify(dataDir)} ${fsEntries.map(s=>JSON.stringify(s)).join(' ')}`);

    // Resume saves
    await this.provider.rcon(containerName, 'save-on').catch(()=>({ok:false}));

    const stat = await fs.stat(file);
    return { file, size: stat.size, startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString() };
  }

  async listBackups({ cartridgeId } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    const dir = path.join(this._cartDir(cartridgeId), 'backups');
    let files = [];
    try { files = await fs.readdir(dir); } catch { return []; }
    const out = [];
    for (const f of files) {
      if (!f.endsWith('.tgz')) continue;
      const p = path.join(dir, f);
      const st = await fs.stat(p);
      out.push({ file: p, size: st.size, modifiedAt: st.mtime.toISOString() });
    }
    return out.sort((a,b)=> (a.modifiedAt < b.modifiedAt ? 1 : -1));
  }

  async restore({ cartridgeId, file, keepCurrent = true } = {}) {
    if (!cartridgeId) throw new Error('cartridgeId is required');
    if (!file) throw new Error('file is required');
    const meta = JSON.parse(await fs.readFile(this._cartMetaPath(cartridgeId), 'utf8'));
    const rt = await this._readRuntime(cartridgeId);
    const slot = rt.slot || meta.activeSlot || 'world';
    // Ensure stopped
    try { await this.stop({ cartridgeId }); } catch {}
    const dataDir = this._cartDataDir(cartridgeId);
    const backupDir = path.join(dataDir, 'restore-backup', new Date().toISOString().replace(/[:T]/g,'-').replace(/\..+/,''));
    // Move current level dirs if needed
    if (keepCurrent) {
      await fs.mkdir(backupDir, { recursive: true });
      const candidates = [slot, `${slot}_nether`, `${slot}_the_end`];
      for (const c of candidates) {
        const src = path.join(dataDir, c);
        try { await fs.access(src); await fs.rename(src, path.join(backupDir, c)); } catch {}
      }
    } else {
      const { rm } = await import('fs/promises');
      const candidates = [slot, `${slot}_nether`, `${slot}_the_end`];
      for (const c of candidates) { await rm(path.join(dataDir,c), { recursive:true, force:true }); }
    }
    const { exec: execCb } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execCb);
    await exec(`tar xzf ${JSON.stringify(file)} -C ${JSON.stringify(dataDir)}`);
    return { restored: true, slot };
  }
}
