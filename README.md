# SvelteKit アプリケーション

SvelteKit と PostgreSQL（Supabase）を使用したフルスタック Web アプリケーション

## 📚 技術スタック

### フロントエンド

- **[SvelteKit](https://kit.svelte.jp/)** ^2.0.0 - フルスタック Web フレームワーク
- **[Svelte](https://svelte.jp/)** ^5.0.0 - リアクティブ UI フレームワーク
- **[TypeScript](https://www.typescriptlang.org/)** ^5.0.0 - 型安全な JavaScript
- **[Vite](https://vitejs.dev/)** ^6.0.0 - 高速ビルドツール

### バックエンド

- **[Node.js](https://nodejs.org/)** v25 - JavaScript ランタイム
- **[PostgreSQL](https://www.postgresql.org/)**（[Supabase](https://supabase.com/)）- リレーショナルデータベース

### 開発ツール

- **[Docker](https://www.docker.com/)** - コンテナ化プラットフォーム
- **[Docker Compose](https://docs.docker.com/compose/)** - マルチコンテナ管理
- **[pnpm](https://pnpm.io/)** 10.25.0 - 高速パッケージマネージャー

### インフラ構成

- マルチステージビルド対応 Dockerfile
- 開発環境と本番環境の分離
- ホットリロード対応

## 🚀 Docker での起動

### 前提条件

以下がインストールされていることを確認してください：

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v20.10 以上)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0 以上)

### 開発環境の起動

```bash
# 1. 開発環境を起動（初回は自動的にビルド）
docker compose --profile dev up

# 2. バックグラウンドで起動
docker compose --profile dev up -d

# 3. ログをリアルタイムで確認
docker compose logs -f dev
```

### issue 単位で並行起動する（worktree 開発）

従来の手順（上記）はそのまま既定ポート（アプリ 5173）で動きます。git worktree で issue ごとに並行開発する場合は、worktree の `.env` に次の 2 キーを設定すると、`rootist-issue-<N>` という別環境（コンテナ・ネットワーク・ポートが issue ごとに分離）として起動できます。

| キー                   | 値（例: issue #112。クォートしない） |
| ---------------------- | ------------------------------------ |
| `COMPOSE_PROJECT_NAME` | `rootist-issue-112`                  |
| `DEV_PORT`             | `20112`（`20000 + 番号`）            |

```bash
# worktree 内で。DB は Supabase 開発用クラウドに直結（DATABASE_URL はメインと同じ値のまま）。アプリはホストで動かす
pnpm dev --port 20112 --strictPort    # DEV_PORT で起動（別ポートにずれない。事前に lsof -iTCP:20112 -sTCP:LISTEN -P が空であることを確認）

# ポートの確認
docker compose ps                       # 自 issue のコンテナと公開ポート
docker compose ls                       # 全プロジェクトの一覧
docker ps --filter name=rootist-issue-  # 全 issue 環境のコンテナとポート
```

命名規則・ポート計算式・制約（Google ログインなど）の詳細は [CLAUDE.md](CLAUDE.md) の「Docker 開発環境（issue 単位の分離）」を参照してください。

### キャッシュなしで起動

```bash
# 1. 既存コンテナとイメージを削除
docker compose --profile dev down --rmi local

# 2. キャッシュなしでビルド
BUILDKIT_PROGRESS=plain docker compose --profile dev build --no-cache --pull

# 3. 起動
docker compose --profile dev up --force-recreate
```

### seedの投入

```bash
pnpm exec tsx seed.ts
```

### マイグレーション

スキーマの正は `supabase/migrations/*.sql`（Supabase CLI のマイグレーション。SQL を手で書く）です。手順の詳細と RLS チェックリストは [`docs/supabase-setup.md`](docs/supabase-setup.md) の「6. スキーマの反映」を参照してください。

#### 開発環境

```bash
# 1. 空のマイグレーションを作り、SQL を手で書く（新しい表は同じファイルで RLS を有効化し、ポリシーは作らない）
pnpm run db:new <名前>

# 2. 適用状況の確認（読み取りのみ）
pnpm run db:status

# 3. PR を出して main へマージする。Supabase の GitHub 連携が未適用分を自動で適用する（手元で流す必要は無い）
#    マージ後に pnpm run db:status で Local と Remote が一致したことを確認する
```

`pnpm run db:migrate` は復旧専用です（通常は使いません）。連携の設定・ブランチ保護・失敗時の復旧は [`docs/supabase-setup.md`](docs/supabase-setup.md) の「14. GitHub 連携」以降を参照してください。

データベースの確認・編集は Supabase ダッシュボードの Table Editor / SQL Editor を使います。

## ☁️ Supabase 環境

DB と email/password 認証は Supabase（Postgres / Supabase Auth）へ移行済みです（Google ログインは #117 まで停止中）。ローカル開発は開発用クラウドプロジェクトへの直結方式で、接続情報は `.env.example` を元に設定します。方式の理由と手順は [`docs/supabase-setup.md`](docs/supabase-setup.md) を参照してください。

## 🤖 Docker MCP Toolkit（Claude Code 連携）

Docker MCP Toolkit（gateway）を導入すると、Claude Code から Docker Hub 上のイメージ検索・リポジトリ情報取得などを自然言語で実行できるようになります。MCP サーバーはコンテナ内で隔離実行されるため、ホストへ Node.js / Python 等の個別環境を構築する必要がありません。

セットアップ手順・動作確認方法・トラブルシューティングは [`docs/docker-mcp-toolkit.md`](docs/docker-mcp-toolkit.md) を参照してください。
