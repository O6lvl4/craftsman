# Craftsman

Minecraft サーバー管理の最小・堅牢な CLI。Craftsman 2.0 では TypeScript + Ink によるモダンなインターフェースを採用し、パイプ可能な出力と対話的フローの両立、フェイルセーフな運用を実現しました。Docker 版 itzg/minecraft-server を第一級の実行プロバイダとして扱い、Pak（旧 cartridge）単位で冪等的な起動・停止・バックアップ・ロールバックを提供します。

## インストール（グローバル）

前提: Docker が動作していること（`docker ps` が成功する状態）

1) リポジトリ直下で（publish 不要）

   ```bash
   npm run install:global
   ```

   開発用にローカルリンクする場合は

   ```bash
   npm run link:global
   ```

2) 動作確認

   ```bash
   craftsman help
   ```

   実行すると ASCII アートバナーと共にコマンド一覧が表示されます。

## Craftsman 2.0 CLI

### 核心原則
- **Zero-config Start**: 設定ファイルなしで即 `craftsman up` からプレイ開始。
- **Progressive Disclosure**: 単純操作は引数ゼロでも実行、必要なときだけ追加情報を要求。
- **Fail-safe Operations**: 破壊的操作は必ず確認とバックアップを経て実行。
- **Stream-first**: すべての出力がパイプ可能。TTY では対話フロー、非 TTY では静的フォーマットに自動切り替え。

### 代表的なコマンド
```bash
craftsman help                          # ASCII アート & コマンド概要
craftsman up my-world --type paper      # 既存なら起動、無ければ作成して起動
craftsman start server my-world         # 明示的に起動（resource 省略可）
craftsman stop                          # 最後に操作したサーバー / 単一稼働サーバーを停止
craftsman backup                        # アクティブサーバーをバックアップ（自動命名）
craftsman logs --tail 200 --json        # ログを JSON で取得（パイプ向け）
craftsman list servers --quiet          # サーバー ID のみを列挙
```

### コンテキスト認識 & フェイルセーフ
- 引数省略時は **最後に触ったサーバー** や **現在稼働中の唯一のサーバー** を自動選択。
- `craftsman delete` は TTY で確認プロンプトを表示、非対話環境では `--force` が必須。
- Backups は RCON 経由で `save-off → save-all flush → tar → save-on` を自動実行。

### 拡張ワークフロー
| ワークフロー | コマンド | 説明 |
| --- | --- | --- |
| クイックスタート | `craftsman quickstart` | ID を自動生成し、作成→起動→接続情報表示を一括実行 |
| アップグレード | `craftsman upgrade alpha --version 1.21.9` | 互換性チェック後にバックアップ→停止→再起動。失敗時は自動ロールバック |
| マイグレーション | `craftsman migrate alpha --from vanilla --to paper` | エンジン種別を変更し、バックアップ付きで切替 |
| クローン | `craftsman clone alpha beta` | メタデータ・ワールドをコピーし、ポート競合を避けた新 Pak を作成 |

### 出力フォーマット
- `--json`, `--yaml`, `--csv`, `--quiet` で明示指定。
- TTY ではテーブル／対話 UI、非 TTY ではデフォルトでコロン区切りのプレーン形式。
- すべてのコマンドがストリームフレンドリーな出力を提供し、`| jq` などのパイプ処理に対応。

### サポートされる主な動詞
| 動詞 | 説明 |
| --- | --- |
| `up` | Pak が存在しなければ作成して起動。存在すればそのまま起動 |
| `start` / `stop` | サーバーの起動・停止（`server` 省略可） |
| `status` / `list` / `show` | サーバー一覧・詳細表示（`--json` 等で機械可読な出力） |
| `logs` | tail ログ取得 (`--tail`, `--follow`) |
| `backup` / `delete` | バックアップ作成・安全な削除 |
| `quickstart` / `upgrade` / `migrate` / `clone` | 統合ワークフロー |

## データ構造（Git 管理外）

Pak（サーバー）単位でデータを保持します。`data/` は生成物のため Git から除外されています（`data/README.md` 参照）。

```
data/
  paks/
    <pakId>/
      pak.json        … メタデータ（エンジン種別・バージョン・スロット）
      data/           … サーバー `/data` としてマウントされる実データ
        world/        … 初回作成時に自動生成される空ワールド
      backups/        … `*.tgz` 形式のバックアップ
      runtime.json    … Provider が記録する稼働情報
```

## REST API

CLI と同じ Supervisor/Provider を REST API からも利用可能です。

```bash
npm run dev:api      # ts-node + Express で API を起動
```

エンドポイント例:
- `GET /health`
- `GET /api/server/status`
- `POST /api/server/start`
- `POST /api/server/stop`
- `GET /api/server/logs`

## 開発メモ
- CLI（Ink）のホットリロードは `npm run dev:cli` で実行できます。
- TypeScript ビルド: `npm run build`
- テスト: `npm test`（ビルド → Jest E2E）

Craftsman 2.0 は「3 分でマルチプレイ」を合言葉に、ゼロコンフィグ・安全・ストリームフレンドリーな Minecraft サーバー運用を目指しています。`craftsman help` から気軽にお試しください。
