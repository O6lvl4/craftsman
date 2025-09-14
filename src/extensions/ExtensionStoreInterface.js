// ExtensionStoreInterface: 抽象インターフェース
// すべての拡張ストアはこの契約に従うこと
export class ExtensionStoreInterface {
  // 拡張を検索
  // params: { query: string, limit?: number, offset?: number, platform?: 'paper'|'fabric'|'neoforge' }
  // returns: Array<{ store, projectId, slug?, title, description?, downloads? }>
  async search(_params) { throw new Error('Not implemented'); }

  // バージョン一覧を取得
  // returns: Array<{ id, name, mcVersions: string[], loaders: string[], files?: any }>
  async versions(_projectId) { throw new Error('Not implemented'); }

  // バージョンの JAR をダウンロード
  // returns: { filename, buffer }
  async download(_args) { throw new Error('Not implemented'); }
}

