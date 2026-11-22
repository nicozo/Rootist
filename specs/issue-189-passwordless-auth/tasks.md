---
description: 'パスワードなしでアカウント登録・ログインする（#189）のタスク'
---

# Tasks: パスワードなしでアカウント登録・ログインする

**Input**: `specs/issue-189-passwordless-auth/` の spec.md・plan.md・research.md・data-model.md・contracts/auth.md・quickstart.md

**Tests**: 必須（constitution 原則 V）。各ストーリーで、テストのタスクを実装より先に行い、テストだけのコミットを先に作る（dev-loop が `pnpm -s tdd-check` で確かめる）。テストの層の分担は plan.md の「テストの分担」と `.claude/rules/testing.md`

**検証**: CLAUDE.md の「Commands」のとおり Docker の `tools` で `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` / `pnpm test:e2e`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 別ファイルで依存が無く、並行してよい
- **[Story]**: US1〜US4 は spec.md のユーザーストーリー 1〜4

---

## Phase 1: Setup

- [ ] T001 `docs/supabase-setup.md` に、メール OTP の設定（桁数・有効期限）・Email Templates（Magic Link と Confirm signup に `{{ .Token }}`）・Custom SMTP・Passkeys（Relying Party ID / Origins）の手順を足し、Confirm email の記述を見直す（research.md R2〜R4、quickstart.md「師匠に頼む準備」。ダッシュボードの操作は師匠）

---

## Phase 2: Foundational（全ストーリーの前提）

- [ ] T002 [P] ログイン直後の行き先の判定 `resolvePostLoginPath` のテストを `src/lib/server/post-login.test.ts` に書く（パスキー 0 件かつ見送り 3 未満 → `/passkey`、パスキーあり・見送り 3 以上・一覧の取得失敗 → `/plan`。回数は data-model.md の 案内の見送り回数.passkey_prompt_dismissals、パスキーの件数は data-model.md の パスキー に従う。FR-013, FR-027）
- [ ] T003 `src/lib/server/post-login.ts` に `resolvePostLoginPath(supabase)` を実装し T002 を通す（`locals.supabase.auth.passkey.list()` と `getUser()` の `user_metadata` を読む。plan.md 設計 3）
- [ ] T004 [P] `src/lib/server/auth-errors.test.ts` に OTP のエラーコードの対応のテストを足す（`otp_expired`・`over_email_send_rate_limit`・`over_request_rate_limit`・`email_address_invalid`・その他。FR-008, FR-009, FR-011, FR-022, FR-023, FR-025）
- [ ] T005 `src/lib/server/auth-errors.ts` に OTP 用の文言と対応関数を足して T004 を通す。パスワード用の関数・文言とそのテストはこの時点では残す（US1 で消す）

**Checkpoint**: 行き先の判定とエラーの対応ができ、各ストーリーに入れる

---

## Phase 3: User Story 1 - メールのコードで登録・ログインする (P1) 🎯 MVP

**Goal**: パスワード無しで、メールの 6 桁コードで登録・ログインできる。既存のパスワード利用者も同じアカウントに入れる

**Independent Test**: spec.md ストーリー 1 の受け入れシナリオ 1〜8

### Tests for User Story 1

- [ ] T006 [P] [US1] `src/routes/login/page.server.test.ts` を書き直す: `sendCode`（正規化・形式検査・`signInWithOtp` に `shouldCreateUser: true` と `data.name` を渡す・登録有無で同じ応答・各エラー）、`verifyCode`（`verifyOtp` の `type: 'email'`・成功で `resolvePostLoginPath` の行き先へ 303・失敗で `step: 'code'` のまま）、ログイン済みの load は /plan（FR-003〜011, FR-022〜026。コードは data-model.md の ログイン用コード に従う）
- [ ] T007 [P] [US1] `src/routes/register/page.server.test.ts` を書き直す（/login と同じ action の契約。FR-006, FR-012, FR-026）
- [ ] T008 [P] [US1] `src/lib/components/email-code-form.svelte.test.ts` を書く: メール入力 → コード入力の切り替えと送り先の表示、再送・「メールアドレスを変える」、コード欄の `inputmode="numeric"`・`autocomplete="one-time-code"`、エラー表示（FR-004, FR-008, FR-009, FR-011）
- [ ] T009 [P] [US1] `src/routes/login/page.svelte.test.ts` と `src/routes/register/page.svelte.test.ts` を書き直す: パスワード欄が無い、/login は 3 手段、/register はコードと Google の 2 手段（FR-001, FR-002, FR-012）
- [ ] T010 [P] [US1] `e2e/login.test.ts` と `e2e/register.test.ts` を新しい画面に合わせる（ルーティングと hydration 後に操作できることだけ。Supabase に往復しない）

### Implementation for User Story 1

- [ ] T011 [US1] `src/lib/components/email-code-form.svelte` を作る（plan.md 設計 1。状態は data-model.md「画面の状態」）
- [ ] T012 [US1] `src/routes/login/+page.server.ts` を `sendCode` / `verifyCode` に作り直す（T003・T005 を使う）
- [ ] T013 [US1] `src/routes/login/+page.svelte` を作り直す（メールのコードと Google。パスキーのボタンは US3 で足す）
- [ ] T014 [US1] `src/routes/register/+page.server.ts` と `src/routes/register/+page.svelte` を作り直す（/login と同じ action。T012 の関数を共通化して使う）
- [ ] T015 [US1] パスワード用のコード（`checkPasswordLength`・`mapSignInErrorCode`・`mapSignUpErrorCode`・パスワードの文言）とそのテストを `src/lib/server/auth-errors.ts` / `auth-errors.test.ts` から消す（FR-001）

**Checkpoint**: コードで登録・ログインでき、パスワードの入口が無い

---

## Phase 4: User Story 2 - パスキーを登録する (P1)

**Goal**: コードか Google で入った直後に案内を出し、パスキーを登録できる。「あとで」は 3 回まで

**Independent Test**: spec.md ストーリー 2 の受け入れシナリオ 1〜7

### Tests for User Story 2

- [ ] T016 [P] [US2] `src/lib/remote/passkey-remote.test.ts` に `startPasskeyRegistration` / `verifyPasskeyRegistration` のテストを書く（未ログインは失敗、入力スキーマ、Supabase のエラー時の応答。FR-014, FR-016）
- [ ] T017 [P] [US2] `src/routes/passkey/page.server.test.ts` を書く: 未ログインの load は /login、`dismiss` は見送り回数を 1 増やして /plan へ 303（data-model.md の 案内の見送り回数.passkey_prompt_dismissals。FR-015, FR-027）
- [ ] T018 [P] [US2] `src/routes/passkey/page.svelte.test.ts` を書く: 非対応ブラウザでは回数を増やさず /plan へ、登録の成功・取り消し・失敗の表示（FR-014, FR-016, FR-019）
- [ ] T019 [P] [US2] `src/lib/passkey-client.test.ts`（クライアント層なら `.svelte.test.ts`）に対応判定と `NotAllowedError` の扱いのテストを書く（FR-016, FR-019）
- [ ] T020 [P] [US2] `e2e/passkey.test.ts` を書く（未ログインで /passkey を開くと /login。Supabase に往復しない）

### Implementation for User Story 2

- [ ] T021 [P] [US2] `src/lib/schemas/passkey.ts` に入力スキーマ（challengeId と credential）を書く（contracts/auth.md）
- [ ] T022 [P] [US2] `src/lib/passkey-client.ts` に対応判定と create / get の処理を書く（research.md R4 の JSON 変換）
- [ ] T023 [US2] `src/lib/server/passkey.ts` に登録の start / verify を書き、`src/lib/remote/passkey.remote.ts` に `command` 2 つを置く（plan.md 設計 2）
- [ ] T024 [US2] `src/routes/passkey/+page.server.ts` と `+page.svelte` を作る（plan.md 設計 3）
- [ ] T025 [US2] `src/routes/login/+page.server.ts` の `verifyCode` が T003 の行き先を使っていることを確かめ、`/passkey` への遷移をテストで押さえる（FR-013）

**Checkpoint**: コードで入るとパスキーを登録でき、「あとで」は 3 回で出なくなる

---

## Phase 5: User Story 3 - パスキーでログインする (P1)

**Goal**: 「パスキーでログイン」と端末の確認だけでログインできる

**Independent Test**: spec.md ストーリー 3 の受け入れシナリオ 1〜3

### Tests for User Story 3

- [ ] T026 [P] [US3] `src/lib/remote/passkey-remote.test.ts` に `startPasskeyLogin` / `verifyPasskeyLogin` のテストを足す（成功でセッションの Cookie が書かれる経路、失敗の応答。FR-017, FR-018）
- [ ] T027 [P] [US3] `src/routes/login/page.svelte.test.ts` に、対応ブラウザでボタンが出る・非対応で出ない・取り消し時に「メールのコードか Google でも」の表示が出るテストを足す（FR-017〜019）

### Implementation for User Story 3

- [ ] T028 [US3] `src/lib/server/passkey.ts` と `src/lib/remote/passkey.remote.ts` にログインの start / verify を足す
- [ ] T029 [US3] `src/routes/login/+page.svelte` に「パスキーでログイン」を足す（T022 を使う。成功で /plan へ）

**Checkpoint**: 3 つのログイン手段がそろう

---

## Phase 6: User Story 4 - Google でログインする (P2)

**Goal**: Google でも同じアカウントに入り、直後の行き先がコードと同じ規則になる

**Independent Test**: spec.md ストーリー 4 の受け入れシナリオ 1〜2

- [ ] T030 [P] [US4] `src/routes/auth/callback/server.test.ts` に、成功時に `resolvePostLoginPath` の行き先へ移るテストを足す（失敗時の `/login?error=google` は今のテストを残す。FR-020, FR-021）
- [ ] T031 [US4] `src/routes/auth/callback/+server.ts` の成功時の行き先を `resolvePostLoginPath` にする

---

## Phase 7: Polish

- [ ] T032 `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` / `pnpm test:e2e` を Docker の `tools` で通す（spec の表の整形も `pnpm format` で直す）
- [ ] T033 quickstart.md の「手で確かめること」を師匠に依頼し、research.md の要確認（R2 の再送・R6 の既存ユーザーと Google）の結果を research.md に書き戻す

---

## Dependencies & Execution Order

- Phase 1・2 → US1 → US2 → US3。US4 は Phase 2 の後ならいつでもよい
- US2 は US1 の `verifyCode`（ログイン直後の行き先）に依存する。US3 は US2 の `passkey-client.ts`・`passkey.ts` に依存する
- 各ストーリーの中は「テスト（コミット）→ 実装」

## Parallel Example

```text
Phase 2: T002 と T004 は並行
US1 のテスト: T006〜T010 は並行
US2 のテスト: T016〜T020 は並行、実装の T021・T022 も並行
```

## Implementation Strategy

- MVP は US1（コードでの登録・ログイン）。これだけで「パスワードを管理しない」は満たせる
- パスキー（US2・US3）は Supabase の Beta に依存するので、US1 の後に足す。Beta の不具合で止まっても US1 は出せる
