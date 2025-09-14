import https from 'https';
import { ExtensionStoreInterface } from '../ExtensionStoreInterface.js';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function getBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

export class CurseForgeStore extends ExtensionStoreInterface {
  constructor({ apiKey } = {}) {
    super();
    this.base = 'https://api.curseforge.com/v1';
    this.apiKey = apiKey || process.env.CURSEFORGE_API_KEY;
  }
  headers() {
    if (!this.apiKey) throw new Error('CURSEFORGE_API_KEY is required');
    return { 'x-api-key': this.apiKey, Accept: 'application/json' };
  }
  async search({ query, limit = 10, offset = 0, platform }) {
    const classId = platform === 'fabric' ? 6 : 5; // 6: Mods, 5: Bukkit plugins
    const url = `${this.base}/mods/search?gameId=432&classId=${classId}&pageSize=${limit}&index=${offset}&searchFilter=${encodeURIComponent(
      query
    )}`;
    const json = await get(url, this.headers());
    const data = json.data || [];
    return data.map((m) => ({
      store: 'curseforge',
      projectId: String(m.id),
      slug: m.slug,
      title: m.name,
      description: m.summary,
      downloads: m.downloadCount || 0,
    }));
  }
  async versions(projectId) {
    const url = `${this.base}/mods/${projectId}/files`;
    const json = await get(url, this.headers());
    const data = json.data || [];
    return data.map((f) => ({
      id: String(f.id),
      name: f.displayName,
      mcVersions: (f.gameVersions || []).filter((v) => /^1\.\d+/.test(v)),
      loaders: (f.gameVersions || [])
        .filter((v) => ['Fabric', 'NeoForge', 'Forge', 'Bukkit', 'Spigot', 'Paper'].includes(v))
        .map((v) => v.toLowerCase()),
      downloadUrl: f.downloadUrl,
      fileName: f.fileName,
    }));
  }
  async download({ projectId, versionId }) {
    const versions = await this.versions(projectId);
    const v = versions.find((x) => x.id === String(versionId)) || versions[0];
    if (!v || !v.downloadUrl) throw new Error('Download URL not found');
    const buf = await getBuffer(v.downloadUrl);
    const filename = v.fileName || `${projectId}-${v.name}.jar`;
    return { filename, buffer: buf };
  }
}

