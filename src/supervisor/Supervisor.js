import { promises as fs } from 'fs';
import path from 'path';

export class Supervisor {
  constructor({ provider, dataDir }) {
    this.provider = provider;
    this.dataDir = dataDir;
    this.runtimePath = path.join(this.dataDir, 'runtime.json');
  }

  async _readRuntime() {
    try {
      const raw = await fs.readFile(this.runtimePath, 'utf8');
      return JSON.parse(raw);
    } catch { return {}; }
  }

  async _writeRuntime(obj) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.runtimePath, JSON.stringify(obj, null, 2));
  }

  async status() {
    const rt = await this._readRuntime();
    const p = await this.provider.status(rt.containerName || 'mc-default');
    // Normalize
    return {
      running: p.running,
      type: p.type || rt.type,
      version: p.version || rt.version,
      ports: p.ports || rt.ports,
      startedAt: p.startedAt || rt.startedAt
    };
  }

  async start({ type = 'paper', version = '1.21.8', memory = '4G', eula = true, onlineMode = true, motd, rconEnabled = true, rconPassword }) {
    // If not explicitly provided, read server-spec.json (written by cartridge insert)
    if (!type || !version) {
      try {
        const specRaw = await fs.readFile(path.join(this.dataDir, 'server-spec.json'), 'utf8');
        const spec = JSON.parse(specRaw);
        type = type || spec.type;
        version = version || spec.version;
      } catch {}
      type = type || 'paper';
      version = version || '1.21.8';
    }
    const name = 'mc-default';
    const existed = await this.provider.status(name);
    if (existed.running) {
      const err = new Error('Server is already running');
      err.code = 'ALREADY_RUNNING';
      throw err;
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
      rconPassword
    });

    await this._writeRuntime({
      containerName: name,
      type,
      version,
      ports: run.ports,
      rcon: run.rcon,
      startedAt: run.startedAt
    });

    return run;
  }

  async stop({ forceKill = false } = {}) {
    const rt = await this._readRuntime();
    const out = await this.provider.stop(rt.containerName || 'mc-default', { forceKill });
    // Keep runtime but mark not running by clearing startedAt
    await this._writeRuntime({ ...rt, startedAt: null });
    return out;
  }

  async logs({ tail = 200 } = {}) {
    const rt = await this._readRuntime();
    return await this.provider.logs(rt.containerName || 'mc-default', { tail });
  }
}
