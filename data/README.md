このディレクトリは、各カセットの実行データ（world、jar、ログ、バックアップなど）を保持するためのランタイム領域です。

Git 管理対象外です（.gitignore で data/ 以下は無視）。

構造（例）
- data/
  - cartridges/
    - <cartridgeId>/
      - data/           … コンテナに /data としてマウント（LEVEL=スロット名）
      - backups/        … バックアップ(.tgz)
      - runtime.json    … 実行情報（開始時刻・ポート等）

メモ
- `craftsman start --cartridge <id> --slot <slot>` で `cartridges/<id>/data` がコンテナ `/data` にマウントされ、
  LEVEL に指定したスロット名のワールドが読み込まれます。
- バックアップ/リストアは `cartridges/<id>/backups` を利用します。
