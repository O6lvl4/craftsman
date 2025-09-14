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

export class ModrinthStore extends ExtensionStoreInterface {
  constructor() {
    this.base = 'https://api.modrinth.com/v2';
  }
  async search({ query, limit = 10, offset = 0, platform }) {
    const facets = [["project_type:mod"]];
    if (platform === 'fabric') facets.push(["categories:fabric"]);
    const url = `${this.base}/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
    const json = await get(url);
    return (json.hits || []).map(h => ({
      slug: h.slug,
      title: h.title,
      description: h.description,
      downloads: h.downloads,
      store: 'modrinth',
      projectId: h.project_id || h.slug
    }));
  }
  async versions(projectId) {
    const url = `${this.base}/project/${projectId}/version`;
    const json = await get(url);
    return json.map(v => ({
      id: v.id,
      name: v.name || v.version_number,
      mcVersions: v.game_versions || [],
      loaders: v.loaders || [],
      files: v.files || []
    }));
  }
  async download({ projectId, versionId }) {
    const versions = await this.versions(projectId);
    const v = versions.find(x => x.id === versionId) || versions[0];
    if (!v || !v.files || !v.files[0]?.url) throw new Error('Download URL not found');
    const url = v.files[0].url;
    const buf = await getBuffer(url);
    // filename heuristics
    const filename = v.files[0].filename || `${projectId}-${v.name}.jar`;
    return { filename, buffer: buf };
  }
}
