# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーション

- 日本語

<!-- - Respond terse like smart caveman. All technical substance stay. Only fluff die. -->

## コーディング規約

- SOLIDの原則に従うこと（過剰に従わなくても良い）

## git戦略

- Conventional Commits
- Claude Code（オーケストレーター本体・generator等のサブエージェントを問わず）が作成するコミットには、コミット履歴の透明性を保つため必ず以下のトレーラーを含めること

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

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
├── +layout.svelte        # グローバルレイアウト（背景グラデーション、認証ナビ）
├── +layout.server.ts     # locals.user をページデータとして供給
├── +page.svelte          # ランディングページ（/plan へ誘導）
├── register/ login/ logout/  # 登録・ログイン・ログアウト（Better Auth、Form Actions）
├── plan/
│   ├── +page.svelte          # 目的地入力・ルート作成ページ（メインUI）
│   ├── result/+page.svelte   # 生成プランの表示（本人向け、クライアントストア依存）
│   └── share/[shareId]/      # 共有プランの閲覧ページ（同行者向け、SSR・認証不要）
└── api/
    ├── places/+server.ts # 住所検索（Google Places API）
    ├── route/+server.ts  # プラン生成（Gemini API）
    └── plans/+server.ts  # プラン保存・共有URL発行
```

### UIコンポーネント (`src/lib/components/`)

- `ui/` — shadcn/ui スタイルの自作コンポーネント群（bits-ui プリミティブ + tailwind-variants）。`button` / `input` / `card` / `item` / `select` / `dialog` / `field` など
- `place-combobox.svelte` / `plan-timeline.svelte` / `time-picker.svelte` — アプリ固有の複合コンポーネント（`plan-timeline.svelte` は `/plan/result` と `/plan/share/[shareId]` の両方でプラン表示に使用）

新しいコンポーネント追加時は `tailwind-variants` で variants を定義し、`src/lib/utils.ts` の `cn()` でクラスをマージするパターンに従う。

### サーバーサイド (`src/lib/server/`)

- `auth.ts` — Better Auth設定（email/password認証）
- `auth-errors.ts` — Better Authのエラーを画面表示用の日本語メッセージに変換
- `db/index.ts` — mysql2 + Drizzle ORM の DB 接続
- `db/schema.ts` — テーブルスキーマ定義（Better Auth標準スキーマ `user`/`session`/`account`/`verification` + `plans`）

`src/hooks.server.ts` が全リクエストでセッションを検証し `event.locals.user` に載せる（ルートガードは無し）。

DB接続には環境変数 `DATABASE_URL`、認証には `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` が必須。`.env` ファイルを参照。

### テスト分類

- `*.svelte.test.ts` — クライアントテスト（Playwright ブラウザ上で Vitest 実行）
- `*.test.ts` — サーバーテスト（Node 環境）
- `e2e/` — Playwright E2E テスト

### 外部API

- **Google Places API (New)** — 住所検索（`GOOGLE_MAPS_API_KEY`、`regionCode: 'JP'` で地域バイアス）
  - `plan/+page.svelte` でデバウンス350msで呼び出し
- **Google Gemini API**（`gemini-flash-latest`） — 目的地からプラン（訪問順序・時刻スケジュール）を生成（`GEMINI_API_KEY`、REST直叩き）
- **Better Auth** — ユーザー登録・ログイン（メール/パスワード）。`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` が必須

## Claude Code プラグイン

**Svelte公式プラグイン**（`svelte@svelte`、`sveltejs/ai-tools`）をプロジェクトスコープで有効化している（`.claude/settings.json`）。初回は `/plugin marketplace add sveltejs/ai-tools` が必要。MCPはstdio方式（`npx -y @sveltejs/mcp`）のためNode.jsが前提。

- **Svelte MCP**: `svelte-autofixer`（コード検証）、`get-documentation` / `list-sections`（公式ドキュメント参照）を使う。`playground-link` は使わない
- **スキル `svelte-core-bestpractices`**: `.svelte` / `.svelte.ts` を書く前に参照する。`svelte-code-writer` はMCPと機能が重複するため使わない
- **エージェント開発フロー**: `generator` が Svelte ファイル変更後に `svelte-autofixer` を実行し、指摘ゼロにする。実行結果は `self_evaluation.md` に記録し、`evaluator` はその記録を証拠に判定する（evaluatorはSvelte MCPを持たない）

### Context7（ライブラリドキュメント参照）

**Context7** を Docker MCP Gateway の `rootist` プロファイル経由で導入している（セットアップは `docs/docker-mcp-toolkit.md`）。APIキーは Docker のシークレット `context7.api_key` で管理し、リポジトリには含めない。

- **使い分け**: Svelte / SvelteKit は **Svelte MCP を優先**する。Context7 はそれ以外のライブラリ（better-auth / drizzle-orm / bits-ui / Tailwind CSS v4 / vite-plus / Gemini API / Google Places API など）の最新ドキュメント参照に使う
- **使い方**: `resolve-library-id` でライブラリIDを解決 → `query-docs` でドキュメントを取得する。package.json のバージョンに合った情報を参照する
- **付与範囲**: `generator` のみ（planner / evaluator は実装詳細に踏み込まないため付与しない）
