# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーション

- 日本語

<!-- - Respond terse like smart caveman. All technical substance stay. Only fluff die. -->

## コーディング規約

- SOLIDの原則に従うこと（過剰に従わなくても良い）

## git戦略

- Conventional Commits
- ブランチ名は `<type>/issue-<issue番号>-<スラッグ>` とする（issueを切ってから開発する）
  - `<type>` はConventional Commitsと同じ種別（`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`）。変更の主目的に合うものを選ぶ
  - `<スラッグ>` は英小文字・数字・ハイフンのみ（kebab-case）で、変更内容が分かる短い英語にする。日本語・大文字・アンダースコア・スペースは使わない
  - 例: `feat/issue-12-share-plan` / `fix/issue-34-user-menu-logout` / `chore/issue-98-context7`
  - `main` への直接コミットはしない。dependabot など自動生成ブランチは対象外
- 開発作業（機能追加・修正など、ファイル変更を伴う作業）を始めるときは、必ず git worktree を切って作業すること。メインのワーキングツリー（`main`）で直接ブランチを切り替えたり変更したりしない
  - 作業ブランチごとに worktree を作成し（`git worktree add -b <branch> .claude/worktrees/<name> main`）、その中で実装・コミット・push を行う
  - worktree には gitignore 対象の `.env` と `node_modules/` が無いので、作成直後にメインのワーキングツリーから `.env` をコピーし `pnpm install` する
  - issue 番号 N の worktree では、`.env` をコピーした直後に `COMPOSE_PROJECT_NAME` / `DEV_PORT` の 2 キーを設定する（`DATABASE_URL` は書き換えない。メインの Supabase 接続をそのまま使う）（値と手順は「Docker 開発環境（issue 単位の分離）」の節）
  - PRマージ後は worktree も削除して片付ける（`cleanup` スキルが worktree とブランチをまとめて削除する）
- Claude Code（オーケストレーター本体・generator等のサブエージェントを問わず）が作成するコミットには、コミット履歴の透明性を保つため必ず以下のトレーラーを含めること

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

- 開発作業は issue 作成（`issue-writer`）から始める。PR 作成時は `pr-writer` に issue 番号を渡し、本文に `Closes #<issue番号>` を入れる（`dev-loop` を使わない単体フローでも同様）
- PR 作成前に `code-review`（effort は常に `high` 固定。Skill 呼び出し時は args に `high` を渡す）と `security-review` を必ず実行する。重大な指摘（正当性バグ・セキュリティ脆弱性）は修正して `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` と両レビューをやり直し、軽微な指摘は PR 本文に「既知の指摘」として記載する（`dev-loop` を使う場合も同じ）

## Commands

```bash
# 開発サーバー起動（ホットリロードあり）
pnpm dev

# 型チェック
pnpm check
pnpm check:watch   # ウォッチモード

# Lint / フォーマット
pnpm lint          # vp fmt --check（フォーマット）+ eslint チェック
pnpm format        # vp fmt で自動整形（prettier ではない）

# テスト
pnpm test:unit     # Vitest（ウォッチモード）
pnpm test:unit -- --run   # 単発実行
pnpm test:e2e      # Playwright E2E
pnpm test          # 全テスト一括

# DB操作（Supabase 開発用クラウドに直結。Supabase CLI のマイグレーション。docs/supabase-setup.md §6 参照）
# スキーマ変更の正式手順: pnpm db:new <名前> → supabase/migrations の SQL を手で書く（RLS チェックリスト）→ ユーザーが自分の端末で pnpm db:migrate（db:push 相当の確認なし適用はしない）
pnpm db:new <名前>  # 空のマイグレーションファイルを作る（DB には触れない）
pnpm db:migrate     # 未適用分を適用（TTY 必須。dry-run → y/N 確認。ユーザーが自分の端末で実行する。エージェントは実行しない）
pnpm db:status      # 適用状況の確認（読み取りのみ）
# DB の閲覧・編集は Supabase ダッシュボードの Table Editor / SQL Editor を使う

# Storybook
pnpm storybook     # localhost:6006 で起動

# Docker
docker compose --profile dev up -d    # dev コンテナ起動
docker compose --profile prod up -d   # prod コンテナ起動

# Docker（issue 用 worktree。.env の COMPOSE_PROJECT_NAME / DEV_PORT が自動で効く）
docker compose ps                     # 自 issue のコンテナと公開ポートを確認
```

## Docker 開発環境（issue 単位の分離）

git worktree 1つ = issue 1つ = Compose プロジェクト 1つとして扱い、コンテナ名・ネットワーク・ボリューム・ホストポートを issue ごとに分離する。複数 issue を同時に起動してもポートは衝突せず、`docker ps` のコンテナ名から issue が分かる。

### 命名規則

| 起動のしかた                                   | Compose プロジェクト名 | コンテナ名                |
| ---------------------------------------------- | ---------------------- | ------------------------- |
| issue 用 worktree（issue 番号 N）              | `rootist-issue-<N>`    | `rootist-issue-<N>-dev-1` |
| 従来起動（メインのワーキングツリー、番号なし） | `rootist`              | `rootist-dev-1`           |

- `<N>` は issue 番号そのまま（例: issue #112 → `rootist-issue-112-dev-1`）
- プロジェクト名は worktree の `.env` の `COMPOSE_PROJECT_NAME` で決まる（Compose 標準。`compose.yaml` に `name:` / `container_name` は書かない。固定するとメインの環境と同名になり壊すため）

### ポート割当

| 用途                        | 従来起動 | issue N の環境 | 例: issue #112 |
| --------------------------- | -------- | -------------- | -------------- |
| アプリ（dev）のホストポート | 5173     | `20000 + N`    | 20112          |

- `compose.yaml` は `DEV_PORT` があればそれを、無ければ（未定義・空文字とも）5173 を使う。コンテナ内部のポートは変わらない
- `DEV_PORT` は、dev コンテナで動かす場合もホストの `pnpm dev` で動かす場合も、その issue のアプリ用ポートとして共通で使う（同時には使わない）
- issue 番号 10000 以上は対象外（到達時に方式を見直す）

### worktree の `.env` に設定する 2 キー（issue N の場合）

`.env` をメインからコピーした直後に設定する。既存キーは置き換え、未定義キーは追加し、各キーがちょうど 1 回だけ現れる状態にする。**値はクォートしない**（`KEY=value` 形式）。`DATABASE_URL` は書き換えない（全 worktree でメインと同じ Supabase の値を使う）。メインの `.env` は変更しない。

| キー                   | 値                  |
| ---------------------- | ------------------- |
| `COMPOSE_PROJECT_NAME` | `rootist-issue-<N>` |
| `DEV_PORT`             | `20000+N`           |

### アプリの DB は Supabase 共有（issue 別の分離なし）

アプリの DB は Supabase の開発用クラウドプロジェクトで、**全 worktree が同じ DB に直結する**（issue 別の分離はしない。理由は `docs/supabase-setup.md`）。issue 環境の Compose プロジェクトで分離するのはアプリ（dev コンテナ）のポートだけ。

- スキーマの正は `supabase/migrations/*.sql`（SQL を手で書く）。変更は `pnpm db:new <名前>` → SQL を書く（新しい表は同じファイルで RLS を有効化し、ポリシーは作らない。静的検査テストが漏れを止める）→ **ユーザーが自分の端末で** `pnpm db:migrate`（dry-run を見て y/N）。**エージェント（オーケストレーター含む）は `pnpm db:migrate` を実行せず、ユーザーに依頼する**。共有 DB なので同時に複数 issue から流さない。`db:push` 相当（履歴なし・確認なしの適用）はしない。TTY ガードはセキュリティ境界ではなく誤操作防止
- 検証で作ったテストデータは、検証後に削除する

### ポートの確認方法

- その worktree の設定値: worktree の `.env` の `COMPOSE_PROJECT_NAME` / `DEV_PORT`
- 起動中の実ポート（worktree 内で）: `docker compose ps`（PORTS 列に `0.0.0.0:20112->5173/tcp` のように出る）
- 全 issue 環境の一覧: `docker compose ls`（プロジェクト名）、`docker ps --filter name=rootist-issue-`（コンテナ名・ポート）
- dev-loop のオーケストレーターは worktree の `.env` から `DEV_PORT` を読み、QA への依頼文に `http://localhost:<DEV_PORT>` を明記する

### 制約・後始末

- issue 番号の無い worktree（dev-loop のテキスト入力モード等）は 4 キーを設定しない。ディレクトリ名由来のプロジェクト名＋既定ポートになり、メインの環境と同時には起動できない（起動に失敗するだけで他の環境は止まらない）
- Google ログインは Google Cloud Console に登録済みのリダイレクト URI（ポート 5173）以外では動かない既知の制約がある。issue 環境（`DEV_PORT` が 5173 以外）では確認できない
- issue 環境の Compose プロジェクト（コンテナ・ネットワーク・ボリューム）は、マージ後に `cleanup` スキルが worktree 削除の前に削除する。メインの `rootist` や他 issue のプロジェクトには触れない

## Supabase 環境

DB は Supabase の Postgres へ移行済み（`DATABASE_URL` は Session pooler の接続文字列）。認証（email/password・Google ログイン）も Supabase Auth を使う。ローカル開発は開発用クラウドプロジェクトへの直結で、`supabase start` は使わない。環境変数は `.env.example`、方式の理由と手順は `docs/supabase-setup.md` を参照。

## アーキテクチャ概要

**サービス概要**: ユーザーが行き先を入力するだけで、最短ルートでの旅行プランを自動生成するサービス。

**スタック**: SvelteKit (Svelte 5) + TypeScript + Tailwind CSS v4 + PostgreSQL（Supabase）+ postgres.js（SQL 直書き。ORM なし）

### ルート構成

```
src/routes/
├── +layout.svelte        # グローバルレイアウト（背景グラデーション、認証ナビ）
├── +layout.server.ts     # locals.user をページデータとして供給
├── +page.svelte          # ランディングページ（/plan へ誘導）
├── register/ login/ logout/  # 登録・ログイン・ログアウト（Supabase Auth、Form Actions）
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

- `supabase.ts` — リクエストごとの Supabase サーバー用クライアント生成（`@supabase/ssr`。セッションは HttpOnly の Cookie）
- `auth-errors.ts` — Supabase Auth のエラーを画面表示用の日本語メッセージに変換、パスワード長の事前検査
- `auth-user.ts` — Supabase のユーザーから `locals.user`（名前・画像）を決める純粋関数
- `db/index.ts` — postgres.js の DB 接続（Supabase の Session pooler）。`db/plans.ts` — plans の保存・取得（パラメータ化した SQL。ルートはここを呼ぶ）
- スキーマ定義は TS ではなく `supabase/migrations/*.sql`（`plans` のみ。ユーザーは Supabase Auth の `auth.users` が管理）。`src/lib/dev-tools/` は Supabase CLI wrapper（`scripts/supabase-db.mjs` の判定ロジック）とマイグレーションの RLS 静的検査

`src/hooks.server.ts` が全リクエストで Supabase Auth にユーザーを確認し（Cookie が無ければ通信しない）、`event.locals.user` / `event.locals.supabase` に載せる（ルートガードは無し）。

DB接続には環境変数 `DATABASE_URL`、認証には `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` が必須。`SUPABASE_SECRET_KEY` はアプリのコードから使わない。`.env` ファイルを参照。

### テスト分類

- `*.svelte.test.ts` — クライアントテスト（Playwright ブラウザ上で Vitest 実行）
- `*.test.ts` — サーバーテスト（Node 環境）
- `e2e/` — Playwright E2E テスト

### 外部API

- **Google Places API (New)** — 住所検索（`GOOGLE_MAPS_API_KEY`、`regionCode: 'JP'` で地域バイアス）
  - `plan/+page.svelte` でデバウンス350msで呼び出し
- **Google Gemini API**（`gemini-flash-latest`） — 目的地からプラン（訪問順序・時刻スケジュール）を生成（`GEMINI_API_KEY`、REST直叩き）
- **Supabase Auth** — ユーザー登録・ログイン（メール/パスワード）。`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` が必須。Google ログインは #117 まで停止

## Claude Code プラグイン

**Svelte公式プラグイン**（`svelte@svelte`、`sveltejs/ai-tools`）をプロジェクトスコープで有効化している（`.claude/settings.json`）。初回は `/plugin marketplace add sveltejs/ai-tools` が必要。MCPはstdio方式（`npx -y @sveltejs/mcp`）のためNode.jsが前提。

- **Svelte MCP**: `svelte-autofixer`（コード検証）、`get-documentation` / `list-sections`（公式ドキュメント参照）を使う。`playground-link` は使わない
- **スキル `svelte-core-bestpractices`**: `.svelte` / `.svelte.ts` を書く前に参照する。`svelte-code-writer` はMCPと機能が重複するため使わない
- **エージェント開発フロー**: `generator` が Svelte ファイル変更後に `svelte-autofixer` を実行し、指摘ゼロにする。実行結果は `self_evaluation.md` に記録し、`evaluator` はその記録を証拠に判定する（evaluatorはSvelte MCPを持たない）

### Context7（ライブラリドキュメント参照）

**Context7** を Docker MCP Gateway の `rootist` プロファイル経由で導入している（セットアップは `docs/docker-mcp-toolkit.md`）。APIキーは Docker のシークレット `context7.api_key` で管理し、リポジトリには含めない。

- **使い分け**: Svelte / SvelteKit は **Svelte MCP を優先**する。Context7 はそれ以外のライブラリ（@supabase/ssr / @supabase/supabase-js / postgres / bits-ui / Tailwind CSS v4 / vite-plus / Gemini API / Google Places API など）の最新ドキュメント参照に使う
- **使い方**: `resolve-library-id` でライブラリIDを解決 → `query-docs` でドキュメントを取得する。package.json のバージョンに合った情報を参照する
- **付与範囲**: `generator` のみ（planner / evaluator は実装詳細に踏み込まないため付与しない）
