# SvelteKit アプリケーション
SvelteKit と MySQL を使用したフルスタック Web アプリケーション

## 📚 技術スタック
### フロントエンド
- **[SvelteKit](https://kit.svelte.jp/)** ^2.0.0 - フルスタック Web フレームワーク
- **[Svelte](https://svelte.jp/)** ^5.0.0 - リアクティブ UI フレームワーク
- **[TypeScript](https://www.typescriptlang.org/)** ^5.0.0 - 型安全な JavaScript
- **[Vite](https://vitejs.dev/)** ^6.0.0 - 高速ビルドツール

### バックエンド
- **[Node.js](https://nodejs.org/)** v25 - JavaScript ランタイム
- **[MySQL](https://www.mysql.com/)** 8.0 - リレーショナルデータベース

### 開発ツール
- **[Docker](https://www.docker.com/)** - コンテナ化プラットフォーム
- **[Docker Compose](https://docs.docker.com/compose/)** - マルチコンテナ管理
- **[pnpm](https://pnpm.io/)** 10.25.0 - 高速パッケージマネージャー

### インフラ構成
- マルチステージビルド対応 Dockerfile
- 開発環境と本番環境の分離
- ホットリロード対応
- 名前付きボリュームによるデータ永続化

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
#### 開発環境
```bash
# 1. スキーマの内容をデータベースに反映
pnpm run db:push

# 2. データベースの確認
pnpm run db:studio
```
