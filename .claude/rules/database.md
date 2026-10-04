---
paths:
  - 'supabase/**'
  - 'scripts/supabase-db.mjs'
  - 'src/lib/server/**'
  - 'src/lib/dev-tools/**'
  - 'src/hooks.server.ts'
  - 'src/routes/**/*.ts'
  - 'package.json'
  - '.env.example'
---

# DB・Supabase

DB は Supabase の Postgres、認証は Supabase Auth。ローカル開発は開発用クラウドプロジェクトへの直結で、`supabase start` は使わない。**全 worktree が同じ DB に直結する**（issue 別の分離はしない）。方式の理由と手順は `docs/supabase-setup.md`、環境変数は `.env.example` を正とする。

## スキーマ変更の手順

スキーマの正は `supabase/migrations/*.sql`（SQL を手で書く。TS のスキーマ定義は無い）。

1. `pnpm db:new <名前>` で空のマイグレーションを作る（DB には触れない）
2. SQL を書く。新しい表は同じファイルで RLS を有効化し、ポリシーは作らない（静的検査テストが漏れを止める）
3. **ユーザーが自分の端末で** `pnpm db:migrate`（dry-run を見て y/N）

- `pnpm db:migrate` をエージェントが実行しない理由: TTY ガードはセキュリティ境界ではなく誤操作防止（禁止ルール自体は CLAUDE.md）
- 共有 DB なので同時に複数 issue から流さない。`db:push` 相当（履歴なし・確認なしの適用）はしない
- 適用状況の確認は `pnpm db:status`（読み取りのみ）。DB の閲覧・編集は Supabase ダッシュボードの Table Editor / SQL Editor を使う
- 検証で作ったテストデータは、検証後に削除する

## サーバーサイド構成

- `src/lib/server/supabase.ts` — リクエストごとの Supabase サーバー用クライアント（`@supabase/ssr`。セッションは HttpOnly の Cookie）
- `src/lib/server/db/` — postgres.js の接続（Session pooler）。`db/plans.ts` がパラメータ化した SQL で plans を保存・取得し、ルートはここを呼ぶ
- `src/lib/server/auth-errors.ts` / `auth-user.ts` — Supabase Auth のエラーの日本語化・`locals.user` を決める純粋関数
- `src/lib/dev-tools/` — Supabase CLI wrapper（`scripts/supabase-db.mjs` の判定ロジック）とマイグレーションの RLS 静的検査
- `src/hooks.server.ts` が全リクエストで Supabase Auth にユーザーを確認し（Cookie が無ければ通信しない）、`event.locals.user` / `event.locals.supabase` に載せる。ルートガードは無い
- `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` が必須。`SUPABASE_SECRET_KEY` はアプリのコードから使わない
