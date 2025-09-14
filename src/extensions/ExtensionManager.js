import { promises as fs } from 'fs';
import path from 'path';
import { ExtensionStore } from './ExtensionStore.js';

function homeDir() { return process.env.HOME || process.env.USERPROFILE || process.cwd(); }

export class ExtensionManager {
  constructor({ baseDir } = {}) {
    const userBase = process.env.CRAFTSMAN_EXT_HOME || path.join(homeDir(), '.craftsman', 'extensions');
    this.baseDir = baseDir || userBase;
    this.store = new ExtensionStore();
  }
  async init() { await fs.mkdir(this.baseDir, { recursive: true }); }
  storePath(store) { return path.join(this.baseDir, store); }
  async ensureStore(store) { await fs.mkdir(this.storePath(store), { recursive: true }); }

  // Store API passthrough
  async search({ store, query, limit, offset, platform }) {
    const s = this.store.require(store);
    return await s.search({ query, limit, offset, platform });
  }
  async versions({ store, projectId }) {
    const s = this.store.require(store);
    return await s.versions(projectId);
  }
  async download({ store, projectId, versionId }) {
    const s = this.store.require(store);
    const { filename, buffer } = await s.download({ projectId, versionId });
    // 保存先: <base>/<store>/<projectId>/<versionId>/<filename>
    const targetDir = path.join(this.baseDir, store, String(projectId), String(versionId));
    await fs.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, filename);
    await fs.writeFile(filePath, buffer);
    return { filename, filePath };
  }

  // User storage management
  async listAll() {
    const out = [];
    const stores = await fs.readdir(this.baseDir).catch(()=>[]);
    for (const s of stores) {
      const sp = path.join(this.baseDir, s);
      const projects = await fs.readdir(sp).catch(()=>[]);
      for (const prj of projects) {
        const vp = path.join(sp, prj);
        const versions = await fs.readdir(vp).catch(()=>[]);
        for (const vid of versions) {
          const dir = path.join(vp, vid);
          const files = await fs.readdir(dir).catch(()=>[]);
          files.filter(f=>f.endsWith('.jar')).forEach(f=> out.push({ store: s, projectId: prj, versionId: vid, file: path.join(dir, f) }));
        }
      }
    }
    return out;
  }
}
