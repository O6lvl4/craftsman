import { promises as fs } from 'fs';
import path from 'path';
import type {
  Provider,
  ProviderLogsResult,
  ProviderStartOptions,
  ProviderStartResult,
  ProviderStatus,
  ProviderStopResult
} from './providers/Provider.js';
import type { PakMetadata } from '../pak/PakManager.js';

export interface SupervisorStatus extends ProviderStatus {
  id: string;
}

export interface SupervisorStartOptions {
  pakId: string;
  slot?: string;
  type?: string;
  version?: string;
  memory?: string;
  eula?: boolean;
  onlineMode?: boolean;
  motd?: string;
  rconEnabled?: boolean;
  rconPassword?: string;
}

export interface SupervisorStopOptions {
  pakId: string;
  forceKill?: boolean;
}

export interface SupervisorLogsOptions {
  pakId: string;
  tail?: number;
}

export interface SupervisorBackupOptions {
  pakId: string;
  name?: string;
}

export interface SupervisorRestoreOptions {
  pakId: string;
  file: string;
  keepCurrent?: boolean;
}

export class Supervisor {
  private readonly provider: Provider;

  private readonly dataDir: string;

  private readonly runtimePath: string;

  constructor({ provider, dataDir }: { provider: Provider; dataDir: string }) {
    this.provider = provider;
    this.dataDir = dataDir;
    this.runtimePath = path.join(this.dataDir, 'runtime.json');
  }

  private pakDir(id: string): string {
    return path.join(this.dataDir, 'paks', id);
  }

  private pakDataDir(id: string): string {
    return path.join(this.pakDir(id), 'data');
  }

  private pakMetaPath(id: string): string {
    return path.join(this.pakDir(id), 'pak.json');
  }

  private runtimePathFor(id: string): string {
    return path.join(this.pakDir(id), 'runtime.json');
  }

  private async readRuntime(id?: string): Promise<Record<string, unknown>> {
    if (id) {
      try {
        const raw = await fs.readFile(this.runtimePathFor(id), 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    try {
      const raw = await fs.readFile(this.runtimePath, 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async writeRuntime(id: string | undefined, obj: Record<string, unknown>): Promise<void> {
    if (id) {
      await fs.mkdir(this.pakDir(id), { recursive: true });
      await fs.writeFile(this.runtimePathFor(id), JSON.stringify(obj, null, 2));
      return;
    }
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.runtimePath, JSON.stringify(obj, null, 2));
  }

  async status({ pakId }: { pakId: string }): Promise<SupervisorStatus> {
    if (!pakId) throw new Error('pakId is required');
    const name = `mc-${pakId}`;
    const runtime = await this.readRuntime(pakId);
    const providerStatus = await this.provider.status(name);
    return {
      id: pakId,
      running: providerStatus.running,
      type: providerStatus.type ?? (runtime.type as string | undefined),
      version: providerStatus.version ?? (runtime.version as string | undefined),
      ports: providerStatus.ports ?? (runtime.ports as Record<string, number> | undefined),
      startedAt: providerStatus.startedAt ?? (runtime.startedAt as string | undefined),
      level: providerStatus.level ?? (runtime.slot as string | undefined)
    };
  }

  async statuses(): Promise<SupervisorStatus[]> {
    const root = path.join(this.dataDir, 'paks');
    let ids: string[] = [];
    try {
      ids = await fs.readdir(root);
    } catch {
      ids = [];
    }
    const results: SupervisorStatus[] = [];
    for (const id of ids) {
      const status = await this.status({ pakId: id }).catch(() => null);
      if (status) results.push(status);
    }
    return results;
  }

  async start(options: SupervisorStartOptions): Promise<ProviderStartResult> {
    const {
      pakId,
      memory = '4G',
      eula = true,
      onlineMode = true,
      motd,
      rconEnabled = true,
      rconPassword
    } = options;
    let { slot, type, version } = options;
    if (!pakId) throw new Error('pakId is required');
    const name = `mc-${pakId}`;
    const existed = await this.provider.status(name);
    if (existed.running) {
      const error = new Error('Server is already running');
      (error as Error & { code?: string }).code = 'ALREADY_RUNNING';
      throw error;
    }

    let meta: PakMetadata | null = null;
    try {
      const raw = await fs.readFile(this.pakMetaPath(pakId), 'utf8');
      meta = JSON.parse(raw) as PakMetadata;
    } catch {
      meta = null;
    }

    if (!type || !version) {
      type = type || meta?.engine?.serverType || 'paper';
      version = version || meta?.engine?.version || '1.21.8';
      slot = slot || meta?.activeSlot || 'world';
    } else if (!slot) {
      slot = meta?.activeSlot || 'world';
    }

    await this.applyExtensions({ pakId, type: type ?? 'paper' });

    const providerOptions: ProviderStartOptions = {
      containerName: name,
      type: type ?? 'paper',
      version: version ?? '1.21.8',
      memory,
      eula,
      onlineMode,
      motd,
      rconEnabled,
      rconPassword,
      level: slot,
      mountDataDir: this.pakDataDir(pakId)
    };

    const run = await this.provider.start(providerOptions);

    await this.writeRuntime(pakId, {
      containerName: name,
      type: providerOptions.type,
      version: providerOptions.version,
      slot,
      ports: run.ports,
      rcon: run.rcon,
      startedAt: run.startedAt
    });

    return run;
  }

  private async applyExtensions({ pakId, type }: { pakId: string; type?: string }): Promise<void> {
    const resolvedType = type ?? 'paper';
    const base = this.pakDataDir(pakId);
    const dest = path.join(base, resolvedType === 'paper' ? 'plugins' : 'mods');
    await fs.mkdir(dest, { recursive: true });
    const manifestPath = path.join(base, '.craftsman-ext.json');
    let previous: string[] = [];
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      previous = (JSON.parse(raw) as { files?: string[] }).files ?? [];
    } catch {
      previous = [];
    }
    for (const relative of previous) {
      try {
        await fs.unlink(path.join(base, relative));
      } catch {
        // ignore
      }
    }
    const metaRaw = await fs.readFile(this.pakMetaPath(pakId), 'utf8');
    const meta = JSON.parse(metaRaw) as PakMetadata;
    const deps = meta.extensions || [];
    const applied: string[] = [];
    for (const dep of deps) {
      const userBase =
        process.env.CRAFTSMAN_EXT_HOME ||
        path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.craftsman', 'extensions');
      const src = path.join(userBase, dep.store, String(dep.projectId), String(dep.versionId), dep.filename);
      const dst = path.join(dest, dep.filename);
      try {
        await fs.copyFile(src, dst);
        applied.push(path.relative(base, dst));
      } catch (error) {
        throw new Error(`Extension not found: ${src} (${error instanceof Error ? error.message : 'unknown error'})`);
      }
    }
    await fs.writeFile(manifestPath, JSON.stringify({ files: applied }, null, 2));
  }

  async stop(options: SupervisorStopOptions): Promise<ProviderStopResult> {
    const { pakId, forceKill = false } = options;
    if (!pakId) throw new Error('pakId is required');
    const name = `mc-${pakId}`;
    const runtime = await this.readRuntime(pakId);
    const result = await this.provider.stop(name, { forceKill });
    await this.writeRuntime(pakId, { ...runtime, startedAt: null });
    return result;
  }

  async logs(options: SupervisorLogsOptions): Promise<ProviderLogsResult> {
    const { pakId, tail = 200 } = options;
    if (!pakId) throw new Error('pakId is required');
    const name = `mc-${pakId}`;
    return this.provider.logs(name, { tail });
  }

  async backup(options: SupervisorBackupOptions): Promise<{ file: string; size: number; startedAt: string; finishedAt: string }> {
    const { pakId, name } = options;
    if (!pakId) throw new Error('pakId is required');
    const startedAt = Date.now();
    const meta = JSON.parse(await fs.readFile(this.pakMetaPath(pakId), 'utf8')) as PakMetadata;
    const runtime = await this.readRuntime(pakId);
    const slot = (runtime.slot as string | undefined) || meta.activeSlot || 'world';
    const containerName = `mc-${pakId}`;
    const backupsDir = path.join(this.pakDir(pakId), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
    const baseName = name || `backup-${stamp}`;
    const file = path.join(backupsDir, `${baseName}.tgz`);

    await this.provider.rcon(containerName, 'save-off').catch(() => ({ ok: false }));
    await this.provider.rcon(containerName, 'save-all flush').catch(() => ({ ok: false }));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const dataDir = this.pakDataDir(pakId);
    const entries = [slot, `${slot}_nether`, `${slot}_the_end`];
    const available: string[] = [];
    for (const entry of entries) {
      try {
        await fs.access(path.join(dataDir, entry));
        available.push(entry);
      } catch {
        // ignore
      }
    }
    if (available.length === 0) throw new Error('No level directories found to backup');

    const { exec: execCb } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execCb);
    await exec(`tar czf ${JSON.stringify(file)} -C ${JSON.stringify(dataDir)} ${available.map((s) => JSON.stringify(s)).join(' ')}`);

    await this.provider.rcon(containerName, 'save-on').catch(() => ({ ok: false }));

    const stat = await fs.stat(file);
    return {
      file,
      size: stat.size,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString()
    };
  }

  async listBackups({ pakId }: { pakId: string }): Promise<Array<{ file: string; size: number; modifiedAt: string }>> {
    if (!pakId) throw new Error('pakId is required');
    const dir = path.join(this.pakDir(pakId), 'backups');
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const records: Array<{ file: string; size: number; modifiedAt: string }> = [];
    for (const f of files) {
      if (!f.endsWith('.tgz')) continue;
      const filePath = path.join(dir, f);
      const stat = await fs.stat(filePath);
      records.push({ file: filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
    return records.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  }

  async restore(options: SupervisorRestoreOptions): Promise<{ restored: boolean; slot: string }> {
    const { pakId, file, keepCurrent = true } = options;
    if (!pakId) throw new Error('pakId is required');
    if (!file) throw new Error('file is required');
    const meta = JSON.parse(await fs.readFile(this.pakMetaPath(pakId), 'utf8')) as PakMetadata;
    const runtime = await this.readRuntime(pakId);
    const slot = (runtime.slot as string | undefined) || meta.activeSlot || 'world';
    try {
      await this.stop({ pakId });
    } catch {
      // ignore
    }
    const dataDir = this.pakDataDir(pakId);
    const backupDir = path.join(
      dataDir,
      'restore-backup',
      new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
    );
    if (keepCurrent) {
      await fs.mkdir(backupDir, { recursive: true });
      const candidates = [slot, `${slot}_nether`, `${slot}_the_end`];
      for (const candidate of candidates) {
        const src = path.join(dataDir, candidate);
        try {
          await fs.access(src);
          await fs.rename(src, path.join(backupDir, candidate));
        } catch {
          // ignore
        }
      }
    } else {
      const { rm } = await import('fs/promises');
      const candidates = [slot, `${slot}_nether`, `${slot}_the_end`];
      for (const candidate of candidates) {
        await rm(path.join(dataDir, candidate), { recursive: true, force: true });
      }
    }

    const { exec: execCb } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execCb);
    await exec(`tar xzf ${JSON.stringify(file)} -C ${JSON.stringify(dataDir)}`);
    return { restored: true, slot };
  }
}
