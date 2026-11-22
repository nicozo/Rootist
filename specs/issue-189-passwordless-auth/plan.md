# Implementation Plan: パスワードなしでアカウント登録・ログインする

**Branch**: `feat/issue-189-passwordless-auth` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/issue-189-passwordless-auth/spec.md`

## Summary

メール＋パスワードの登録・ログインを外し、メールの 6 桁コード（Supabase Auth のメール OTP）・パスキー（Supabase Auth のパスキー Beta の 2 段階 API）・Google（既存）に置き換える。認証はこれまでどおりサーバー用クライアントと HttpOnly Cookie だけで行い、ブラウザは WebAuthn の操作だけを担当する。コードか Google でログインした直後、パスキーが無く見送りが 3 回未満なら案内の画面 `/passkey` に移す。表・マイグレーションは追加しない。調査と判断の根拠は [research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript、Node（Docker の `tools` と本番と同じ版）

**Primary Dependencies**: SvelteKit 3 (Svelte 5)、`@supabase/ssr` 0.12、`@supabase/supabase-js` 2.119（パスキーの API を含む。依存の追加は無い）、valibot、shadcn-svelte

**Storage**: Supabase Auth（ユーザー・`user_metadata`・パスキー・one-time token）。アプリの DB の変更は無い（[data-model.md](./data-model.md)）

**Testing**: Vitest（サーバー / クライアント）、Playwright E2E（`.claude/rules/testing.md`）

**Target Platform**: 今の Web アプリ。パスキーは WebAuthn の JSON 変換（`PublicKeyCredential.parseCreationOptionsFromJSON` 等）があるブラウザだけで出す

**Project Type**: Web アプリ（SvelteKit の単一プロジェクト）

**Performance Goals**: spec の SC-002・SC-004 のとおり（利用者の操作数と所要時間）。サーバー側の追加の性能目標は無い

**Constraints**: 認証 Cookie は HttpOnly のまま（`src/lib/server/supabase.ts` の I-5）。共有 DB に書かない。Supabase のダッシュボード設定と SMTP は師匠の作業（[quickstart.md](./quickstart.md)）

**Scale/Scope**: 画面 3 つ（/login・/register の作り直し、/passkey の新設）、Google のコールバックの行き先の変更、remote function 4 つ

## Constitution Check

| 原則                                | 判定 | 根拠                                                                                                            |
| ----------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| I. 規約は CLAUDE.md と rules に従う | 適合 | `#lib`・remote functions の置き場所（sveltekit.md）、入出力の正（api.md）、テストの分担（testing.md）に沿う     |
| II. spec は何を・なぜだけ           | 適合 | 技術（OTP・パスキー API・Cookie）は plan と research にだけ書いた                                               |
| III. 完了の基準は受け入れシナリオ   | 適合 | 下の「テストの分担」で全要件 ID を受け入れシナリオかエッジケースのテストに結び付けた。spec に無い機能は足さない |
| IV. 検証は CLAUDE.md の手順         | 適合 | Docker の `tools` で check / lint / test:unit / test:e2e                                                        |
| V. テスト先行・実装は dev-loop      | 適合 | tasks.md でストーリーごとにテストのタスクを先に置く。実装は dev-loop                                            |

Phase 1 の設計後に見直しても違反は無い（Complexity Tracking は不要）。

## 設計

### 1. メールのコード（ストーリー 1）

- `/login` と `/register` の form action を `sendCode` と `verifyCode` の 2 つにする。`signInWithPassword` と `signUp` は消す（FR-001）
- `sendCode`: メールを正規化（既存の `normalizeEmail`）→ 形式検査（既存の `isValidEmailFormat`、FR-011）→ `signInWithOtp({ email, options: { shouldCreateUser: true, data: { name: deriveNameFromEmail(email) } } })`（FR-003, FR-006）。成功なら `{ step: 'code', email }` を返す（FR-004）。登録の有無で応答を変えない（FR-024）
- `verifyCode`: `verifyOtp({ email, token, type: 'email' })`。成功なら行き先の判定（下の 3）へ 303（FR-005, FR-007）。失敗は `{ step: 'code', email }` と固定のメッセージ（FR-008）
- エラーコードの対応を `auth-errors.ts` に足す: `otp_expired` → 誤り・期限切れ（FR-008, FR-022）、`over_email_send_rate_limit` → 再送の待ち（FR-009）、`over_request_rate_limit` → 回数制限（FR-023）、`email_address_invalid` → 形式（FR-011）、それ以外の送信失敗 → もう一度（FR-025）。パスワード用の関数と文言（`checkPasswordLength`・`mapSignInErrorCode` 等）は使われなくなるので消す
- 画面は共通のコンポーネント `src/lib/components/email-code-form.svelte`（メール入力 ⇄ コード入力、再送、「メールアドレスを変える」）を /login と /register で使う。コード欄は `inputmode="numeric"`・`autocomplete="one-time-code"`
- /register はパスキーのボタンを出さない（FR-012）。/login は 3 手段を出す（FR-002）

### 2. パスキー（ストーリー 2・3）

- サーバー: `src/lib/server/passkey.ts` に `locals.supabase.auth.passkey.*` を呼ぶ関数を置き、`src/lib/remote/passkey.remote.ts`（`command` 4 つ）から呼ぶ。入力スキーマは `src/lib/schemas/passkey.ts`（[contracts/auth.md](./contracts/auth.md)）
- ブラウザ: `src/lib/passkey-client.ts` に、対応判定（`PublicKeyCredential` と JSON 変換の有無）と、options → `navigator.credentials.create/get` → `toJSON()` の処理を置く。取り消し（`NotAllowedError`）は失敗として扱う（FR-016, FR-018）
- ログイン: /login の「パスキーでログイン」→ `startPasskeyLogin` → `get` → `verifyPasskeyLogin`。成功でサーバーがセッションの Cookie を書き、画面は `/plan` へ移る（FR-017）。失敗は「メールのコードか Google でも」の文言（FR-018）。非対応ならボタンを描画しない（FR-019）

### 3. ログイン直後の行き先と案内（ストーリー 2）

- `src/lib/server/post-login.ts` の `resolvePostLoginPath(supabase)`: `passkey.list()` が 0 件で `user_metadata.passkey_prompt_dismissals` が 3 未満なら `/passkey`、それ以外（一覧の取得に失敗したときを含む）は `/plan`（FR-013, FR-027）
- 呼ぶ所は `verifyCode` と `src/routes/auth/callback/+server.ts`（Google、FR-020）。パスキーでのログインは呼ばない（持っているので案内不要）
- `/passkey`（新設）: load でログイン必須（未ログインは /login へ）。画面で対応判定し、非対応ならすぐ `/plan` へ移る（回数は増やさない、FR-019）。「登録する」→ `startPasskeyRegistration` → `create` → `verifyPasskeyRegistration` → 成功の表示と `/plan` への導線（FR-014）。失敗は登録できなかった旨とあとで登録できる旨（FR-016）。「あとで」→ `?/dismiss` が回数を 1 増やして `/plan` へ（FR-015）
- ログイン済みで /login・/register を開いたら /plan（今の load を残す、FR-026）

### 4. 消すもの・直すもの

- パスワードの入力欄・`signUp`・`signInWithPassword` とそのテスト、パスワードの文言
- `docs/supabase-setup.md` に、OTP の設定・メールテンプレート・SMTP・パスキーの設定の手順を足す（Confirm email の記述も見直す）
- 既存の E2E（`e2e/login.test.ts`・`e2e/register.test.ts`）を新しい画面に合わせる

## テストの分担

| 層                  | 確かめる要件                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest サーバー     | sendCode / verifyCode の入力検査と Supabase への渡し方・エラーの対応（FR-003, 005〜011, 022〜025）、行き先の判定（FR-013, 027）、dismiss（FR-015）、コールバックの行き先（FR-020, 021）、remote function の入力検査とエラー（FR-014, 016〜018）、load の誘導（FR-026） |
| Vitest クライアント | 画面の表示（パスワード欄が無い・3 手段・登録画面は 2 手段、FR-001, 002, 012）、メール ⇄ コードの切り替えと送り先の表示（FR-004）、エラー表示、非対応ブラウザでボタンを出さない（FR-019）、パスキーの取り消し時の表示（FR-016, 018）                                    |
| E2E                 | /login・/register・/passkey のルーティング（未ログインの /passkey は /login へ、ログイン済みの /login は /plan へ）。Supabase には往復しない                                                                                                                           |
| 手動（師匠）        | [quickstart.md](./quickstart.md) の表（実メール・実パスキー・既存アカウント・Google の結合）                                                                                                                                                                           |

## Project Structure

### Documentation (this feature)

```text
specs/issue-189-passwordless-auth/
├── spec.md
├── plan.md              # この文書
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/auth.md
└── tasks.md             # /speckit-tasks で作る
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── components/email-code-form.svelte   # 新規
│   ├── passkey-client.ts                   # 新規（ブラウザの WebAuthn 操作）
│   ├── remote/passkey.remote.ts            # 新規
│   ├── schemas/passkey.ts                  # 新規
│   └── server/
│       ├── auth-errors.ts                  # OTP のエラーを追加、パスワード用を削除
│       ├── passkey.ts                      # 新規
│       └── post-login.ts                   # 新規
└── routes/
    ├── login/                              # 作り直し
    ├── register/                           # 作り直し
    ├── passkey/                            # 新規（案内の画面）
    └── auth/callback/+server.ts            # 行き先を post-login に
e2e/
├── login.test.ts / register.test.ts        # 直す
└── passkey.test.ts                         # 新規
docs/supabase-setup.md                      # 設定手順を追記
```

**Structure Decision**: 既存の SvelteKit の単一プロジェクトに足す。サーバーのロジックは `src/lib/server/`、remote function は薄い層（`.claude/rules/sveltekit.md`）。
