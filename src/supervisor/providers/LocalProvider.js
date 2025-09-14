import { promisify } from 'util';
import { exec as execCb, spawn } from 'child_process';
import path from 'path';
import { Provider } from './Provider.js';

const exec = promisify(execCb);

// Development-only provider; expects a server start script to exist, or runs a dummy sleep
export class LocalProvider extends Provider {
  constructor({ dataDir }) {
    super();
    this.dataDir = dataDir;
    this.proc = null;
  }

  async status() {
    const running = !!(this.proc && this.proc.exitCode === null);
    return { running };
  }

  async start({ type = 'paper', version = '1.21.8' }) {
    if (this.proc && this.proc.exitCode === null) throw new Error('Already running');
    const root = path.resolve(this.dataDir, '..');
    // Try common script name, else fallback to a long sleep to simulate
    const scripts = {
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

  async stop(_name, { forceKill = false } = {}) {
    if (!this.proc || this.proc.exitCode !== null) return { stopped: true };
    try { this.proc.stdin.write('stop\n'); } catch {}
    await new Promise(r => setTimeout(r, 2000));
    if (this.proc && this.proc.exitCode === null) {
      try { this.proc.kill(forceKill ? 'SIGKILL' : 'SIGTERM'); } catch {}
    }
    return { stopped: true };
  }

  async logs() {
    return [];
  }
}

