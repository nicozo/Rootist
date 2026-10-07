# CLAUDE.md

AI エージェント向けの作業指示。コードを読めば分かることは書かない。ファイルを触るときだけ要る指示は `.claude/rules/` に置く（`paths:` に一致するファイルを扱うときだけ読み込まれる）。

## コミュニケーション

- 日本語

## コーディング規約

- SOLIDの原則に従うこと（過剰に従わなくても良い）

## Single Source of Truth（SSoT）

同じ知識・定義・値は1か所にだけ持ち、他はそこから参照・導出する。重複させると片方だけ更新されて食い違う。コード・設計・ドキュメントのすべてが対象。

- 型は元の定義から導出し、同じ形を手書きで再定義しない
- 定数・設定値・文言・環境変数名を複数ファイルにコピーせず、共通化して import する。環境変数は `.env.example` を正とする
- 導出できる値を別に保持しない。状態は元データから計算する
- 同じ説明を複数の文書に書かない。正となる文書を決め、他はリンクで参照する
- 例外: 偶然似ているだけで意味が異なるコードは無理に共通化しない。共通化のための過剰な抽象化は避ける

### 情報の置き場所（上流から下流へ。下流は上流を参照し、内容を写さない）

| 層                     | 置き場所          | 役割                                                                            |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------- |
| 上流（何を・なぜ）     | Notion Docs DB    | 機能要望・仕様・サービス開発/運用での意思決定（PRD/ADR/設計/ガイド/Runbook）    |
|                        | Notion Roadmap DB | 開発進捗・ロードマップ                                                          |
| 下流（どう作って出す） | GitHub issue      | 開発タスク（個別の要望と完了条件）。仕様は写さず Notion へリンクする            |
|                        | コード・スキーマ  | 実装そのもの。コードから分かることは文書に書かない                              |
|                        | CLAUDE.md         | AIエージェント向けの作業指示（規約・全体像）。パス依存の指示は `.claude/rules/` |
|                        | README.md         | 技術スタックと Docker 手順                                                      |
|                        | `docs/`           | コードや環境設定と一緒に変わる詳細手順（セットアップなど）                      |

- 新しいドキュメントは、上表で役割が合う既存の場所に追加する。別の場所に作らない
- `docs/` と Notion の境目: コードや環境設定と一緒に変わる手順は `docs/`、サービス全体に関わる意思決定と仕様は Notion。手順に添える、その手順が成り立つ前提の短い理由（例: `docs/supabase-setup.md` の方式の理由）は `docs/` に置いてよい
- Notion の入口は「🧭 Rootist」ハブページ（親は「個人開発」。配下に Docs DB / Roadmap DB）。https://app.notion.com/p/339e07f1f4f680daa01bc51666f2b6bb

## git戦略

- Conventional Commits
- ブランチ名は `<type>/issue-<issue番号>-<スラッグ>` とする（issueを切ってから開発する）
  - `<type>` はConventional Commitsと同じ種別（`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`）。変更の主目的に合うものを選ぶ
  - `<スラッグ>` は英小文字・数字・ハイフンのみ（kebab-case）で、変更内容が分かる短い英語にする
  - 例: `feat/issue-12-share-plan` / `fix/issue-34-user-menu-logout`
  - IMPORTANT: `main` への直接コミットはしない。dependabot など自動生成ブランチは対象外
- IMPORTANT: 開発作業（機能追加・修正など、ファイル変更を伴う作業）は必ず git worktree を切って行う。メインのワーキングツリー（`main`）で直接ブランチを切り替えたり変更したりしない
  - `git worktree add -b <branch> .claude/worktrees/<name> main` で作成し、その中で実装・コミット・push を行う
  - worktree には gitignore 対象の `.env` と `node_modules/` が無いので、作成直後にメインから `.env` をコピーし `pnpm install` する
  - issue 番号 N の worktree では、`.env` に `COMPOSE_PROJECT_NAME=rootist-issue-<N>` と `DEV_PORT=<20000+N>` を設定する（値はクォートしない。各キーはちょうど 1 回。`DATABASE_URL` は書き換えない）。命名・ポートの詳細は `.claude/rules/docker-worktree.md`
  - PRマージ後は `cleanup` スキルが worktree とブランチをまとめて削除する
- Claude Code（オーケストレーター本体・generator等のサブエージェントを問わず）が作成するコミットには、必ず以下のトレーラーを含める

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

- 開発作業は issue 作成（`issue-writer`）から始める。PR 作成時は `pr-writer` に issue 番号を渡し、本文に `Closes #<issue番号>` を入れる（`dev-loop` を使わない単体フローでも同様）
- PR 作成前に `code-review`（effort は常に `high` 固定。Skill 呼び出し時は args に `high` を渡す）と `security-review` を必ず実行する。重大な指摘（正当性バグ・セキュリティ脆弱性）は修正して検証コマンドと両レビューをやり直し、軽微な指摘は PR 本文に「既知の指摘」として記載する（`dev-loop` を使う場合も同じ）

## Commands

```bash
pnpm dev                  # 開発サーバー（ホットリロード）
pnpm check                # 型チェック
pnpm lint                 # vp fmt --check + eslint
pnpm format               # vp fmt で自動整形（prettier ではない）
pnpm test:unit -- --run   # Vitest 単発実行（-- --run なしはウォッチモード）
pnpm test:e2e             # Playwright E2E
pnpm storybook            # localhost:6006
docker compose --profile dev up -d    # dev コンテナ起動（prod は --profile prod）
```

- 完了とみなす前に `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` を通す
- DB 操作（`pnpm db:new` / `db:status` / `db:migrate`）の手順は `.claude/rules/database.md`
- IMPORTANT: エージェントは共有 DB に書き込まない（`pnpm db:migrate` / `supabase db push` / `migration repair` を実行せず、必要ならユーザーに依頼する）。共有 DB への適用は main へのマージ時の自動適用（Supabase の GitHub 連携）が通常経路で、`pnpm db:migrate` は復旧専用

## アーキテクチャ概要

**サービス概要**: ユーザーが行き先を入力するだけで、最短ルートでの旅行プランを自動生成するサービス。

**スタック**: SvelteKit (Svelte 5) + TypeScript + Tailwind CSS v4 + PostgreSQL（Supabase）+ postgres.js（SQL 直書き。ORM なし）

- DB・認証は Supabase（Postgres + Supabase Auth）。方式・スキーマ変更の手順・サーバーサイド構成は `.claude/rules/database.md`
- 外部 API: Google Places API (New)（住所検索・座標取得）。訪問順序とスケジュールは外部 API を使わず `src/lib/server/route-planner.ts` で計算する
