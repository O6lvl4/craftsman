# Craftsman

Minecraft サーバー管理の最小・堅牢な CLI。Docker 版 itzg/minecraft-server を第一級の実行プロバイダとして採用し、カセット（Pak）を単位に冪等的な起動/停止/バックアップ/リストアを提供します。

## インストール（グローバル）

前提: Docker が動作していること（`docker ps` が成功）

1) リポジトリ直下で（publish 不要）

   npm run install:global

   もしくは開発向けリンク

   npm run link:global

2) 確認

   craftsman --help

## 基本コマンド（サーバ）

- ステータス

  - すべてのカセット: `craftsman status [--json]`
  - 個別カセット: `craftsman status --pak <id> [--json]`

- 起動（冪等）

  `craftsman start --pak <id> [--slot <slot>] [--type paper|fabric|neoforge] [--version <ver>] [--memory 8G] [--eula true] [--onlineMode true] [--motd "..."] [--rconEnabled true] [--rconPassword ...]`

  備考: `--type/--version` を省略すると、カセットの `pak.json`（engine）を使用。`--slot` 未指定時は `activeSlot` を使用。内部的にはカセットの data/ をコンテナ `/data` にマウントし、`LEVEL=<slot>` でワールドを選択します。

- 停止

  `craftsman stop --pak <id> [--force]`

- ログ

  `craftsman logs --pak <id> [--tail 200] [--follow]`

## カセット（Pak）

- 作成

  `craftsman pak create --id <id> --type paper|fabric|neoforge --version <ver> [--name NAME]`

- 一覧

  `craftsman pak list [--json]`

- ワールド保存（移行用：現行の /data/world* → スロットへ取り込み）

  `craftsman pak save --id <id> --slot <slot>`

- アクティブスロット設定

  `craftsman pak set-active --id <id> --slot <slot>`

- 挿入（稼働中は --force 推奨。新モデルでは activeSlot の設定が主目的）

  `craftsman pak insert --id <id> [--slot <slot>] [--force]`

- 拡張（Pak 内 CRUD）

  `craftsman pak extension list --id <id>`

  `craftsman pak extension add --id <id> --store <store> --project <projectId> --version <versionId> --filename <filename>`

  `craftsman pak extension update --id <id> --store <store> --project <projectId> --version <versionId> --filename <filename>`

  `craftsman pak extension remove --id <id> --store <store> --project <projectId>`

## バックアップ / リストア（カセット単位）

- バックアップ（オンライン、RCON で save-off → save-all flush → tar → save-on）

  `craftsman backup --pak <id> [--name NAME] [--json]`

  出力例: `{ file, size, startedAt, finishedAt }`

- バックアップ一覧

  `craftsman backups list --pak <id> [--json]`

- リストア（停止→展開、必要なら現行データ退避）

  `craftsman restore --pak <id> --file <path_to_tgz> [--keep-current]`

  備考: `--keep-current` で `data/restore-backup/<timestamp>/` に退避。

## 例: 新規カセットで遊ぶ（Paper 1.21.8）

1) 作成

   craftsman pak create --id alpha --type paper --version 1.21.8 --name "Alpha"

2) 新規スロットで起動（初回は新しいワールドが生成される）

   craftsman start --pak alpha --slot fresh1 --memory 8G

3) 状態/ログ

   craftsman status --pak alpha --json

   craftsman logs --pak alpha --tail 200 --follow

4) 停止

   craftsman stop --pak alpha

5) バックアップ

   craftsman backup --pak alpha --name first

## 拡張ストア（検索→バージョン→DL→カセット登録）

1) 検索（例）

   craftsman extension store search --store modrinth --query sodium --platform fabric

2) バージョン一覧

   craftsman extension store versions --store modrinth --project <projectId>

3) ダウンロード

   craftsman extension store download --store modrinth --project <projectId> --version <versionId>

4) カセットに依存登録（CRUD）

   craftsman pak extension add --id <id> --store modrinth --project <projectId> --version <versionId> --filename <filename>

   craftsman pak extension list --id <id>

   craftsman pak extension update --id <id> --store ... --project ... --version ... --filename ...

   craftsman pak extension remove --id <id> --store ... --project ...

## データ構造（Git 管理外）

- data/ は生成物のため Git 無視（data/README.md 参照）
- カセット単位の構造
  - data/
    - paks/
      - <id>/
        - data/           … コンテナ `/data` にマウント（LEVEL=<slot>）
        - backups/        … バックアップ(.tgz)
        - runtime.json    … 実行情報（開始時刻・ポート等）

## 備考（オプション）

- Provider: 既定は Docker。開発用に local を指定可能（`--provider local`）
- REST API は任意で利用可能（`node src/index.js`）
  - GET /health
  - GET /api/server/status / POST /api/server/start / POST /api/server/stop / GET /api/server/logs
