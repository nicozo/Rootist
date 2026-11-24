# Implementation Plan: Google アカウントだけで登録・ログインする

**Branch**: `feat/issue-199-google-only-auth` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/issue-199-google-only-auth/spec.md` の要件

## Summary

#189 で入れたメールのコード（Supabase Auth のメール OTP）とパスキーをアプリから外し、ログインの手段を今の Google（Supabase Auth の OAuth・PKCE）だけにする。/login は Google のボタンだけ（Google が無効な環境では「ログインできない」旨）にし、/register は /login へ移し、/passkey とログイン直後の案内は消す。Google のコールバックは常に /plan へ移す。同じメールアドレスのアカウントの統合は Supabase の自動リンクに任せる。表示名の読み方（`auth-user.ts`）は変えない。Supabase の側でも Email と Passkeys を無効にする（師匠の作業）。表・マイグレーションは追加しない。調査と判断の根拠は [research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript、Node（Docker の `tools` と本番と同じ版）

**Primary Dependencies**: SvelteKit 3 (Svelte 5)、`@supabase/ssr`、`@supabase/supabase-js`（依存の追加・削除は無い）、shadcn-svelte

**Storage**: Supabase Auth（ユーザー・identities・`user_metadata`）。アプリの DB の変更は無い（[data-model.md](./data-model.md)）

**Testing**: Vitest（サーバー / クライアント）、Playwright E2E（`.claude/rules/testing.md`）

**Target Platform**: 今の Web アプリ

**Project Type**: Web アプリ（SvelteKit の単一プロジェクト）

**Performance Goals**: spec の SC-001 のとおり（利用者の操作は Google のボタンと Google の認証だけ）。追加の性能目標は無い

**Constraints**: 認証 Cookie は HttpOnly のまま（`src/lib/server/supabase.ts`）。共有 DB に書かない。Supabase のダッシュボード設定は師匠の作業（[quickstart.md](./quickstart.md)）

**Scale/Scope**: 画面 1 つの作り直し（/login）、ルート 2 つの廃止（/register は移すだけ、/passkey は削除）、ヘッダーとコールバックの小変更、#189 のコードとテストの削除

## Constitution Check

| 原則                                | 判定 | 根拠                                                                                                       |
| ----------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| I. 規約は CLAUDE.md と rules に従う | 適合 | `#lib`・ルートの置き場所（sveltekit.md）、テストの分担（testing.md）、Supabase の構成（database.md）に沿う |
| II. spec は何を・なぜだけ           | 適合 | 技術（OAuth・自動リンク・405・ダッシュボード設定）は plan と research にだけ書いた                         |
| III. 完了の基準は受け入れシナリオ   | 適合 | 下の「テストの分担」で「案」の要件 ID をすべてテストか手動確認に結び付けた。spec に無い機能は足さない      |
| IV. 検証は CLAUDE.md の手順         | 適合 | Docker の `tools` で check / lint / test:unit / test:e2e                                                   |
| V. テスト先行・実装は dev-loop      | 適合 | tasks.md でストーリーごとにテスト（期待の書き換えを含む）を実装より先に置く。実装は dev-loop               |

Phase 1 の設計後に見直しても違反は無い（Complexity Tracking は不要）。

## 設計

### 1. ログイン画面（ストーリー 1）

- `src/routes/login/+page.server.ts`: load は今のまま（ログイン済みは /plan、`googleAuthEnabled` と `googleError` を返す。FR-007, FR-008）。`actions` を消す（FR-011。[research.md](./research.md) R-4）
- `src/routes/login/+page.svelte`: パスキーのボタン・`EmailCodeForm`・「または」の区切り・カード下の「新規登録」リンクを消す。`googleAuthEnabled` が真なら「Googleでログイン」（`POST /auth/google`、今のフォームのまま）、偽なら「現在ログインできません。」を出す（FR-001, FR-002, FR-012。R-6）。説明文は「Googleアカウントでログインします。初めての方はアカウントが作られます。」のように登録も兼ねることが分かる文にする
- `src/routes/auth/callback/+server.ts`: 交換に成功したら `/plan` へ（`resolvePostLoginPath` を呼ばない。FR-003, FR-004, FR-014）。失敗・取り消しは今のまま `/login?error=google`（FR-007）
- 表示名は `src/lib/server/auth-user.ts` のまま（FR-005）。Google ログインのたびに `user_metadata.name` 等が Google の値でマージされる（R-1。RT-REQ-1 への申し送りもそこに書いた）
- 同じメールアドレスの統合は Supabase の自動リンク（R-2、FR-004）。アプリ側の処理は無い
- アカウントは任意（FR-017）。ログイン必須の箇所は今も無く（`hooks.server.ts` は `locals.user` を入れるだけ。/plan・プランの生成・共有ページは `locals.user` を見ない）、この変更でも足さない。プランはアカウントにひも付かない

### 2. 自前の入口の撤去（ストーリー 2）

- `/register`: `+page.svelte`・`+page.server.ts` とテストを消し、`src/routes/register/+server.ts` の `GET` で `redirect(308, '/login')`（FR-009。R-5）。POST は 405（FR-011）
- `src/routes/+layout.svelte`: 未ログインのヘッダーから「新規登録」のリンクを消す（FR-010）。`e2e/helpers.ts` の `expectLoggedOut` も「新規登録」を期待しないよう直す
- `/passkey`: `src/routes/passkey/` を消す（404。FR-016）
- 消すファイル（R-7）: `src/lib/server/email-code-actions.ts`、`src/lib/components/email-code-form.svelte`、`src/lib/server/passkey.ts`、`src/lib/server/post-login.ts`、`src/lib/passkey-client.ts`、`src/lib/remote/passkey.remote.ts`、`src/lib/schemas/passkey.ts` と、それぞれのテスト（FR-011, FR-013, FR-014）
- `src/lib/server/auth-errors.ts`: `describeAuthError`・`isUnexpectedAuthError`（`hooks.server.ts` が使う）だけを残し、メールのコード用の文言・関数（`EMAIL_FORMAT_MESSAGE`〜`RATE_LIMIT_MESSAGE`、`normalizeEmail`、`isValidEmailFormat`、`deriveNameFromEmail`、`mapSendCodeErrorCode`、`mapVerifyCodeErrorCode`）とそのテストを消す
- `src/lib/server/supabase.ts` のコメントの「/login・/register」を「/login」に直す
- 消したあと、`passkey`・`email-code`・`sendCode`・`verifyCode`・`post-login` への参照が `src/`・`e2e/` に残っていないことを grep で確かめる

### 3. 文書

- `docs/supabase-setup.md` の「9. 認証（Supabase Auth）の設定」を Google だけの前提に書き直す（Email プロバイダとパスキーを無効にする手順と確認のコマンド。メール OTP・メールテンプレート・SMTP・パスキーの設定の手順を消す）。「11. Google ログイン」の「未設定ならメールのコードでのログインは影響を受けない」等の記述と「同じメールアドレスの扱い」を直し、Google ログインのたびに `user_metadata` がマージされること（R-1）を一行足す
- `.claude/rules/database.md` の `auth-errors.ts` の説明（「エラーの日本語化」）を残す関数に合わせて直す
- `specs/issue-189-passwordless-auth/` は履歴として残し、書き換えない（この spec の冒頭から参照している）

## テストの分担

| 層                  | 確かめる要件                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest サーバー     | /login の load（ログイン済みは /plan・`googleError`。FR-007, 008）と `actions` が無いこと（FR-011）、コールバックの行き先（成功は /plan・失敗は /login?error=google。FR-003, 004, 007, 014）、/register の `GET` が 308 で /login（FR-009）、共有ページの load が未ログインでもプランを返す（FR-017）、`auth-errors.ts` に残す 2 関数        |
| Vitest クライアント | ヘッダーに「新規登録」が無い（`src/routes/layout.svelte.test.ts`。FR-010）、/login の表示: Google が有効なら「Googleでログイン」だけで、メールアドレス・コード・パスワードの欄と「パスキーでログイン」と「新規登録」が無い（FR-001, 002, 013）、無効なら「現在ログインできません。」でボタンが無い（FR-012）、`googleError` の表示（FR-007） |
| E2E                 | 未ログインのままプランを作って結果画面に着く（`e2e/plan.test.ts` の P-2。FR-017）、`/login` に入力欄が無い（FR-002）、`/register` → `/login`（FR-009）、ヘッダーに「新規登録」が無い（FR-010）、`POST /login?/sendCode`・`POST /register?/sendCode` が 405（FR-011）、`/passkey` が 404（FR-016）。Supabase には往復しない                   |
| 手動（師匠）        | [quickstart.md](./quickstart.md) の表（実の Google ログイン・同じアカウントへの再ログイン・表示名・Supabase 側の OTP の停止。FR-003, 004, 005, 011）                                                                                                                                                                                         |

- FR-006・FR-015 は取り下げ（テストしない）
- `e2e/login.test.ts`・`e2e/register.test.ts`・`e2e/passkey.test.ts` は今の期待（メールアドレスの欄・新規登録の画面・/passkey → /login）を新しい期待に書き換える

## Project Structure

### Documentation (this feature)

```text
specs/issue-199-google-only-auth/
├── spec.md
├── plan.md              # この文書
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/routes.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks で作る
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── components/email-code-form.svelte   # 削除
│   ├── passkey-client.ts                   # 削除
│   ├── remote/passkey.remote.ts            # 削除
│   ├── schemas/passkey.ts                  # 削除
│   └── server/
│       ├── auth-errors.ts                  # メールのコード用を削除
│       ├── email-code-actions.ts           # 削除
│       ├── passkey.ts                      # 削除
│       ├── post-login.ts                   # 削除
│       └── supabase.ts                     # コメントのみ
└── routes/
    ├── +layout.svelte                      # 「新規登録」を削除
    ├── login/                              # Google だけに作り直し
    ├── register/+server.ts                 # 新規（/login へ 308）。ページは削除
    ├── passkey/                            # 削除
    └── auth/callback/+server.ts            # 行き先を /plan に
e2e/
├── helpers.ts                              # expectLoggedOut を直す
├── login.test.ts / register.test.ts        # 直す
└── passkey.test.ts                         # /passkey の 404 に直す
docs/supabase-setup.md                      # 9・11 を直す
.claude/rules/database.md                   # auth-errors.ts の説明
```

**Structure Decision**: 既存の SvelteKit の単一プロジェクトの中で、#189 で足したものを外す。新しい層は作らない。
