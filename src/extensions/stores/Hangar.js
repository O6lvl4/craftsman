import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

import { ExtensionStoreInterface } from '../ExtensionStoreInterface.js';

export class HangarStore extends ExtensionStoreInterface {
  constructor() {
    this.base = 'https://hangar.papermc.io/api/v1';
  }
  async search({ query, limit = 10, offset = 0 }) {
    const url = `${this.base}/projects?limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`;
    const json = await get(url);
    const result = json.result || [];
    return result.map(p => ({
      slug: p.namespace.slug,
      title: p.name,
      description: p.description,
      downloads: p.stats?.downloads || 0,
      store: 'hangar',
      projectId: `${p.namespace.owner}/${p.namespace.slug}`
    }));
  }
  async versions(project) {
    const [owner, slug] = project.includes('/') ? project.split('/') : [null, project];
    const url = `${this.base}/projects/${owner || 'unknown'}/${slug}/versions`;
    const json = await get(url);
    const res = json.result || [];
    return res.map(v => ({
      id: v.id,
      name: v.name,
      mcVersions: (v.platformDependencies?.PAPER || []).map(x => x.version) || [],
      loaders: ['paper'],
      downloads: v.downloads?.PAPER?.downloadUrl || null,
      fileInfo: v.downloads?.PAPER?.fileInfo || null
    }));
  }
  async download({ projectId, versionId }) {
    const versions = await this.versions(projectId);
    const v = versions.find(x => x.id === versionId) || versions[0];
    if (!v || !v.downloads) throw new Error('Download URL not found');
    const buf = await getBuffer(v.downloads);
    const filename = v.fileInfo?.fileName || `${projectId}-${v.name}.jar`;
    return { filename, buffer: buf };
  }
}
