import { promisify } from 'util';
import { exec as execCb, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import {
  BaseProvider,
  type ProviderLogsResult,
  type ProviderRconResult,
  type ProviderStartOptions,
  type ProviderStartResult,
  type ProviderStatus,
  type ProviderStopOptions,
  type ProviderStopResult
} from './Provider.js';

const exec = promisify(execCb);

export class LocalProvider extends BaseProvider {
  private readonly dataDir: string;

  private proc: ChildProcessWithoutNullStreams | null = null;

  constructor({ dataDir }: { dataDir: string }) {
    super();
    this.dataDir = dataDir;
  }

  async status(): Promise<ProviderStatus> {
    const running = !!(this.proc && this.proc.exitCode === null);
    return { running };
  }

  async start(options: Partial<ProviderStartOptions>): Promise<ProviderStartResult> {
    const { type = 'paper', version = '1.21.8' } = options;
    if (this.proc && this.proc.exitCode === null) throw new Error('Already running');
    const root = path.resolve(this.dataDir, '..');
    const scripts: Record<string, string> = {
      paper: './start-optimized-paper.sh',
      fabric: './start-server-fabric.sh',
      neoforge: './start-server-neoforge.sh'
    };
    const script = scripts[type] || scripts.paper;
    try {
      this.proc = spawn('bash', [script, version], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      this.proc = spawn('bash', ['-lc', 'sleep 3600'], { stdio: ['pipe', 'pipe', 'pipe'] });
    }
    return { startedAt: new Date().toISOString() };
  }

  async stop(_name: string, options: ProviderStopOptions = {}): Promise<ProviderStopResult> {
    const { forceKill = false } = options;
    if (!this.proc || this.proc.exitCode !== null) return { stopped: true };
    try {
      this.proc.stdin.write('stop\n');
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (this.proc && this.proc.exitCode === null) {
      try {
        this.proc.kill(forceKill ? 'SIGKILL' : 'SIGTERM');
      } catch {
        // ignore
      }
    }
    return { stopped: true };
  }

  async logs(): Promise<ProviderLogsResult> {
    return [];
  }

  async rcon(): Promise<ProviderRconResult> {
    return { ok: false, error: 'RCON not supported in local provider' };
  }
}
