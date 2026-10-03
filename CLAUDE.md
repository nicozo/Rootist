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
  - issue 番号 N の worktree では、`.env` をコピーした直後に `COMPOSE_PROJECT_NAME` / `DEV_PORT` / `MYSQL_PORT` / `DATABASE_URL` / `BETTER_AUTH_URL` の 5 キーを設定する（値と手順は「Docker 開発環境（issue 単位の分離）」の節）
  - PRマージ後は worktree も削除して片付ける（`cleanup` スキルが worktree とブランチをまとめて削除する）
- Claude Code（オーケストレーター本体・generator等のサブエージェントを問わず）が作成するコミットには、コミット履歴の透明性を保つため必ず以下のトレーラーを含めること

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

- 開発作業は issue 作成（`issue-writer`）から始める。PR 作成時は `pr-writer` に issue 番号を渡し、本文に `Closes #<issue番号>` を入れる（`dev-loop` を使わない単体フローでも同様）
- PR 作成前に `code-review` と `security-review` を必ず実行する。重大な指摘（正当性バグ・セキュリティ脆弱性）は修正して `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` と両レビューをやり直し、軽微な指摘は PR 本文に「既知の指摘」として記載する（`dev-loop` を使う場合も同じ）

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

# DB操作（要: MySQLコンテナ起動。従来起動は docker compose --profile dev up -d、issue 環境は docker compose up -d mysql）
pnpm db:push       # スキーマをDBに直接反映（開発用）
pnpm db:generate   # マイグレーションファイル生成
pnpm db:migrate    # マイグレーション実行
pnpm db:studio     # Drizzle Studio（DBブラウザ）

# Storybook
pnpm storybook     # localhost:6006 で起動

# Docker
docker compose --profile dev up -d    # MySQL + dev コンテナ起動
docker compose --profile prod up -d   # MySQL + prod コンテナ起動

# Docker（issue 用 worktree。.env の COMPOSE_PROJECT_NAME / ポート設定が自動で効く）
docker compose up -d mysql            # 自 issue の MySQL だけ起動（アプリはホストの pnpm dev）
docker compose ps                     # 自 issue のコンテナと公開ポートを確認
```

## Docker 開発環境（issue 単位の分離）

git worktree 1つ = issue 1つ = Compose プロジェクト 1つとして扱い、コンテナ名・ネットワーク・ボリューム・ホストポートを issue ごとに分離する。複数 issue を同時に起動してもポートは衝突せず、`docker ps` のコンテナ名から issue が分かる。

### 命名規則

| 起動のしかた                                   | Compose プロジェクト名 | コンテナ名                                              |
| ---------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| issue 用 worktree（issue 番号 N）              | `rootist-issue-<N>`    | `rootist-issue-<N>-dev-1` / `rootist-issue-<N>-mysql-1` |
| 従来起動（メインのワーキングツリー、番号なし） | `rootist`              | `rootist-dev-1` / `rootist-mysql-1`                     |

- `<N>` は issue 番号そのまま（例: issue #112 → `rootist-issue-112-mysql-1`、ボリューム `rootist-issue-112_mysql-data`）
- プロジェクト名は worktree の `.env` の `COMPOSE_PROJECT_NAME` で決まる（Compose 標準。`compose.yaml` に `name:` / `container_name` は書かない。固定するとメインの環境と同名になり壊すため）

### ポート割当

| 用途                        | 従来起動 | issue N の環境 | 例: issue #112 |
| --------------------------- | -------- | -------------- | -------------- |
| アプリ（dev）のホストポート | 5173     | `20000 + N`    | 20112          |
| MySQL のホストポート        | 3306     | `30000 + N`    | 30112          |

- `compose.yaml` は `DEV_PORT` / `MYSQL_PORT` があればそれを、無ければ（未定義・空文字とも）5173 / 3306 を使う。コンテナ内部のポートは変わらない
- `DEV_PORT` は、dev コンテナで動かす場合もホストの `pnpm dev` で動かす場合も、その issue のアプリ用ポートとして共通で使う（同時には使わない）
- issue 番号 10000 以上は対象外（到達時に方式を見直す）

### worktree の `.env` に設定する 5 キー（issue N の場合）

`.env` をメインからコピーした直後に設定する。既存キーは置き換え、未定義キーは追加し、各キーがちょうど 1 回だけ現れる状態にする。**値はクォートしない**（`KEY=value` 形式。メインの `DATABASE_URL="..."` のクォートも外す）。メインの `.env` は変更しない。

| キー                   | 値                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `COMPOSE_PROJECT_NAME` | `rootist-issue-<N>`                                                                        |
| `DEV_PORT`             | `20000+N`                                                                                  |
| `MYSQL_PORT`           | `30000+N`                                                                                  |
| `DATABASE_URL`         | メインの値のホスト部を `localhost:<MYSQL_PORT>` に置換（ユーザー・パスワード・DB名は同じ） |
| `BETTER_AUTH_URL`      | `http://localhost:<DEV_PORT>`（Better Auth は baseURL とアクセス元の一致が前提）           |

### MySQL は issue ごとに分離する（案B）

dev・MySQL とも issue 別にする。プロジェクト名を分けるだけで MySQL・ボリュームも自然に分離され、`compose.yaml` の変更がポートの可変化だけで済む。`pnpm db:push` によるスキーマ変更やテストデータが他 issue・メインの環境に干渉せず、後始末も「その issue のプロジェクトを丸ごと消す」だけで済む（MySQL 共有案は外部ネットワーク・ボリュームの追加設定が必要で複雑になる）。

- issue 環境の MySQL は空で始まる。初回起動後に `pnpm db:push` でスキーマを反映する（seed が必要なら `pnpm exec tsx seed.ts`）
- MySQL コンテナが issue 数だけ動くのでメモリを使う。マージ後の `cleanup` で確実に削除する

### ポートの確認方法

- その worktree の設定値: worktree の `.env` の `COMPOSE_PROJECT_NAME` / `DEV_PORT` / `MYSQL_PORT`
- 起動中の実ポート（worktree 内で）: `docker compose ps`（PORTS 列に `0.0.0.0:20112->5173/tcp` のように出る）
- 全 issue 環境の一覧: `docker compose ls`（プロジェクト名）、`docker ps --filter name=rootist-issue-`（コンテナ名・ポート）
- dev-loop のオーケストレーターは worktree の `.env` から `DEV_PORT` を読み、QA への依頼文に `http://localhost:<DEV_PORT>` を明記する

### 制約・後始末

- issue 番号の無い worktree（dev-loop のテキスト入力モード等）は 5 キーを設定しない。ディレクトリ名由来のプロジェクト名＋既定ポートになり、メインの環境と同時には起動できない（起動に失敗するだけで他の環境は止まらない）
- Google ログインは Google Cloud Console に登録済みのリダイレクト URI（ポート 5173）以外では動かない既知の制約がある。issue 環境（`DEV_PORT` が 5173 以外）では確認できない
- issue 環境の Compose プロジェクト（コンテナ・ネットワーク・ボリューム）は、マージ後に `cleanup` スキルが worktree 削除の前に削除する。メインの `rootist` や他 issue のプロジェクトには触れない

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
