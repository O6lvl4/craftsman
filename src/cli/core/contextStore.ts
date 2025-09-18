import { promises as fs } from 'fs';
import path from 'path';
import { CONTEXT_FILE } from '../constants.js';
import type { CLIState, CLIStateStore } from '../types.js';

export class FileStateStore implements CLIStateStore {
  private readonly filePath: string;

  constructor({ dataDir }: { dataDir: string }) {
    this.filePath = path.join(dataDir, CONTEXT_FILE);
  }

  async read(): Promise<CLIState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as CLIState;
      return {
        lastServer: parsed.lastServer,
        recentServers: parsed.recentServers ?? []
      };
    } catch {
      return { recentServers: [] };
    }
  }

  async write(state: CLIState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async update(partial: Partial<CLIState>): Promise<void> {
    const current = await this.read();
    const next: CLIState = {
      ...current,
      ...partial,
      recentServers: mergeRecent(current.recentServers, partial.lastServer)
    };
    await this.write(next);
  }
}

function mergeRecent(recent: string[], candidate?: string): string[] {
  if (!candidate) return recent.slice(0, 10);
  const deduped = [candidate, ...recent.filter((id) => id !== candidate)];
  return deduped.slice(0, 10);
}
