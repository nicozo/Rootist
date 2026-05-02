# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーション
- 日本語
- Respond terse like smart caveman. All technical substance stay. Only fluff die.

## コーディング規約
- SOLIDの原則に従うこと（過剰に従わなくても良い）

## git戦略
- Conventional Commits

## Commands

```bash
# 開発サーバー起動（ホットリロードあり）
pnpm dev

# 型チェック
pnpm check
pnpm check:watch   # ウォッチモード

# Lint / フォーマット
pnpm lint          # prettier + eslint チェック
pnpm format        # prettier 自動修正

# テスト
pnpm test:unit     # Vitest（ウォッチモード）
pnpm test:unit -- --run   # 単発実行
pnpm test:e2e      # Playwright E2E
pnpm test          # 全テスト一括

# DB操作（要: docker compose --profile dev up -d でMySQLコンテナ起動）
pnpm db:push       # スキーマをDBに直接反映（開発用）
pnpm db:generate   # マイグレーションファイル生成
pnpm db:migrate    # マイグレーション実行
pnpm db:studio     # Drizzle Studio（DBブラウザ）

# Storybook
pnpm storybook     # localhost:6006 で起動

# Docker
docker compose --profile dev up -d    # MySQL + dev コンテナ起動
docker compose --profile prod up -d   # MySQL + prod コンテナ起動
```

## アーキテクチャ概要

**サービス概要**: ユーザーが行き先を入力するだけで、最短ルートでの旅行プランを自動生成するサービス。

**スタック**: SvelteKit (Svelte 5) + TypeScript + Tailwind CSS v4 + MySQL + Drizzle ORM

### ルート構成

```
src/routes/
├── +layout.svelte   # グローバルレイアウト（背景グラデーション）
├── +page.svelte     # ランディングページ（/plan へ誘導）
└── plan/
    └── +page.svelte # 目的地入力・ルート作成ページ（メインUI）
```

### UIコンポーネント (`src/lib/components/ui/`)

shadcn/ui スタイルの自作コンポーネント群（bits-ui プリミティブ + tailwind-variants）:
- `button`, `input`, `label`, `card`, `badge`, `separator` — 基本フォームUI
- `item` — リストアイテム用コンポーネント群（`Item`, `ItemContent`, `ItemTitle`, `ItemDescription` など）

新しいコンポーネント追加時は `tailwind-variants` で variants を定義し、`src/lib/utils.ts` の `cn()` でクラスをマージするパターンに従う。

### サーバーサイド (`src/lib/server/`)

- `db/index.ts` — mysql2 + Drizzle ORM の DB 接続
- `db/schema.ts` — テーブルスキーマ定義（Drizzle）

DB接続には環境変数 `DATABASE_URL` が必須。`.env` ファイルを参照。

### テスト分類

- `*.svelte.test.ts` — クライアントテスト（Playwright ブラウザ上で Vitest 実行）
- `*.test.ts` — サーバーテスト（Node 環境）
- `e2e/` — Playwright E2E テスト

### 外部API

- **OpenStreetMap Nominatim** — 住所検索（APIキー不要、1秒1リクエスト制限）
  - `plan/+page.svelte` でデバウンス350msで呼び出し
