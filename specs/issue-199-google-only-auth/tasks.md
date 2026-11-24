---
description: 'Google アカウントだけで登録・ログインする（#199）のタスク'
---

# Tasks: Google アカウントだけで登録・ログインする

**Input**: `specs/issue-199-google-only-auth/` の spec.md・plan.md・research.md・data-model.md・contracts/routes.md・quickstart.md

**Tests**: 必須（constitution 原則 V）。T005・T006 は変えない振る舞い（FR-017）を固定するテストで、最初から通る（失敗→成功の対象外）。各ストーリーで、テストのタスク（期待の書き換えを含む）を実装より先に行い、テストだけのコミットを先に作る（dev-loop が `pnpm -s tdd-check` で確かめる）。消すコードのテストは、テストを緩めるのではなく対象ごと消すので、そのコードを消す実装のタスクで一緒に消す。テストの層の分担は plan.md の「テストの分担」と `.claude/rules/testing.md`

**検証**: CLAUDE.md の「Commands」のとおり Docker の `tools` で `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run` / `pnpm test:e2e`

**テスト名の要件 ID**: 既存のテスト名にある #189 の要件 ID（FR-020・FR-021・FR-026 など）は、触るときにこの spec の ID（下の各タスクに書いたもの）に付け替える

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 別ファイルで依存が無く、並行してよい
- **[Story]**: US1・US2 は spec.md のユーザーストーリー 1・2

---

## Phase 1: Setup

なし（依存・設定の追加は無い）。

## Phase 2: Foundational

なし（各ストーリーは既存の Google ログイン（`/auth/google`・`/auth/callback`）の上で進められる）。

---

## Phase 3: User Story 1 - Google アカウントで登録・ログインする (P1) 🎯 MVP

**Goal**: ログイン画面が「Googleでログイン」だけ（Google が無効なら「現在ログインできません。」）になり、Google の認証のあとは案内を挟まず /plan に移る

**Independent Test**: `/login` に Google のボタン以外の手段・入力欄が無いこと、コールバックの成功が /plan に移ることを Vitest と E2E で確かめる（実の Google ログインは quickstart.md の手動確認）

### Tests for User Story 1（先に書いて失敗させる）

- [ ] T001 [P] [US1] `src/routes/login/page.svelte.test.ts` を書き換える: `googleAuthEnabled: true` で「Googleでログイン」のボタンがあり、メールアドレス・コード・パスワードの入力欄、「パスキーでログイン」、カード下の「新規登録」リンクが無い（FR-001, FR-002, FR-013）。`googleAuthEnabled: false` で「現在ログインできません。」が出てボタンが無い（FR-012）。`googleError` があればその文言が出る（FR-007）。メールのコード・パスキーのテストは消す
- [ ] T002 [P] [US1] `src/routes/login/page.server.test.ts` を書き換える: load のテスト（ログイン済みは /plan へ 303＝FR-008、`googleAuthEnabled`、`?error` の固定文言＝FR-007、生の値を載せない）を残し、`sendCode`・`verifyCode` のテストを消して「モジュールが `actions` を export しない」テストを足す（FR-011。research.md R-4）
- [ ] T003 [P] [US1] `src/routes/auth/callback/server.test.ts` を書き換える: 交換に成功したら `/plan` へ 303 で、`auth.passkey.list` を呼ばない（FR-003, FR-004, FR-014）。code 無し・キャンセル・交換失敗・例外は `/login?error=google`（FR-007）。`post-login` のモックと「行き先の判定」のテストを消す
- [ ] T004 [P] [US1] `e2e/login.test.ts` を書き換える: L-1 はナビの「ログイン」から `/login` に入り、見出し「ログイン」があり、`メールアドレス` の欄・「コードを送る」・`パスワード` の欄が無い（FR-002）。L-2（「新規登録」への移動）は消す。L-3（`?error=google` の文言、FR-007）は残す。`POST /login?/sendCode` と `POST /login?/verifyCode` が 405 になるテストを足す（FR-011。contracts/routes.md。`page.request.post` に `Origin` をベース URL にして form の本文で送る＝SvelteKit の CSRF 検査で 403 にならないように。Supabase には届かない）。Google ボタンの有無は環境で変わるので確かめない
- [ ] T005 [P] [US1] `e2e/plan.test.ts` の P-2（場所を選んでプランを作り結果画面に着く）の最初に `expectLoggedOut(page)`（`e2e/helpers.ts`）を足し、未ログインのままプランの作成と結果の表示ができることを明示する（FR-017。今の振る舞いを固定するテストなので最初から通る）
- [ ] T006 [P] [US1] `src/routes/plan/share/[shareId]/page.server.test.ts` に「未ログイン（`locals.user` が null）でも該当するプランを返す」テストを足す（FR-017。今の振る舞いを固定するテストなので最初から通る）

### Implementation for User Story 1

- [ ] T007 [US1] `src/routes/login/+page.server.ts` から `actions` と `email-code-actions.js` の import を消して T002 を通す（plan.md 設計 1）
- [ ] T008 [US1] `src/routes/login/+page.svelte` を作り直して T001 を通す: パスキーのボタンと処理、`EmailCodeForm`、「または」の区切り、カード下の「新規登録」を消し、`data.googleAuthEnabled` が真なら今の `POST /auth/google` のフォーム、偽なら「現在ログインできません。」。説明文は登録も兼ねることが分かる文にする（plan.md 設計 1。research.md R-6）
- [ ] T009 [US1] `src/routes/auth/callback/+server.ts` の成功時の行き先を `/plan` にし、`resolvePostLoginPath` の import を消して T003 を通す（表示名は `src/lib/server/auth-user.ts` のまま＝data-model.md の アカウント.user_metadata。FR-005 は既存の `src/lib/server/auth-user.test.ts` が確かめる）
- [ ] T010 [US1] T007〜T009 のあとで `pnpm test:e2e` を流し、`e2e/login.test.ts`（T004）を通す

**Checkpoint**: Google だけでログインでき、ログイン画面に自前の手段が無い

---

## Phase 4: User Story 2 - 自前の認証の入口をなくす (P2)

**Goal**: /register は /login に移り、ヘッダーは「ログイン」だけ、/passkey は 404、メールのコードとパスキーのコードが残らない

**Independent Test**: `/register` → `/login`、`POST /register?/sendCode` が 405、`/passkey` が 404、ヘッダーに「新規登録」が無いことを E2E で確かめ、`passkey`・`sendCode` 等への参照が残らないことを grep で確かめる

### Tests for User Story 2（先に書いて失敗させる）

- [ ] T011 [P] [US2] `src/routes/register/server.test.ts` を新しく書く: `GET` が `/login` へ 308（FR-009。research.md R-5）。`src/routes/register/page.server.test.ts`・`page.svelte.test.ts` は T015 でページと一緒に消す
- [ ] T012 [P] [US2] `e2e/register.test.ts` を書き換える: `/register` を開くと `/login` に移り見出し「ログイン」が出る（FR-009）、`POST /register?/sendCode` が 405（FR-011。T004 と同じ送り方）。R-1・R-2・R-4 と `submitWithoutBrowserValidation` は消す
- [ ] T013 [P] [US2] ヘッダーの期待を直す（FR-010）: `src/routes/layout.svelte.test.ts` の「未ログインならログイン・新規登録リンクを表示する」を、「ログイン」のリンクがあり「新規登録」のリンクが無い期待に書き換える。`e2e/helpers.ts` の `expectLoggedOut` も「新規登録」のリンクが 0 件の期待に直す（これを使う `e2e/auth-cookie.test.ts` で確かめられる）
- [ ] T014 [P] [US2] `e2e/passkey.test.ts` を書き換える: 未ログインで `/passkey` を開くと応答が 404 になる（FR-016。独自のエラー画面は無く SvelteKit の既定の 404 の画面）

### Implementation for User Story 2

- [ ] T015 [US2] `src/routes/register/+page.svelte`・`+page.server.ts`・`page.server.test.ts`・`page.svelte.test.ts` を消し、`src/routes/register/+server.ts` に `GET` で `redirect(308, '/login')` を置いて T011・T012 を通す
- [ ] T016 [US2] `src/routes/+layout.svelte` の未ログインのヘッダーから「新規登録」のリンクを消して T013 を通す
- [ ] T017 [US2] パスキーを消して T014 を通す: `src/routes/passkey/`（ページとテスト）、`src/lib/remote/passkey.remote.ts`・`passkey-remote.test.ts`、`src/lib/server/passkey.ts`、`src/lib/passkey-client.ts`・`passkey-client.svelte.test.ts`、`src/lib/schemas/passkey.ts`、`src/lib/server/post-login.ts`・`post-login.test.ts`（FR-013, FR-014, FR-016。research.md R-7。data-model.md の アカウント.user_metadata の `passkey_prompt_dismissals` は消さない）
- [ ] T018 [US2] メールのコードを消す: `src/lib/server/email-code-actions.ts`、`src/lib/components/email-code-form.svelte`・`email-code-form.svelte.test.ts`。`src/lib/server/auth-errors.ts` は `describeAuthError`・`isUnexpectedAuthError` と `AuthErrorLike` だけを残し、ほかの文言・関数と `auth-errors.test.ts` の該当テストを消す（FR-011。plan.md 設計 2）
- [ ] T019 [US2] `src/lib/server/supabase.ts` のコメントの「/login・/register」を「/login」に直し、`src/`・`e2e/` に `passkey`・`email-code`・`EmailCodeForm`・`sendCode`・`verifyCode`・`post-login`・`resolve('register')` への参照が残っていないことを grep で確かめる

**Checkpoint**: 自前の認証の入口が画面にもフォームの送信にも残らない（SC-002, SC-003）

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 [P] `docs/supabase-setup.md` の「9. 認証（Supabase Auth）の設定」を Google だけの前提に書き直す（Email プロバイダと Passkeys を無効にする手順と、`/auth/v1/settings` の `external.email` が `false` の確認。メール OTP・Email Templates・SMTP・Passkeys の設定の手順を消す）。「11. Google ログイン」の「メールのコードでのログインは影響を受けない」等の記述と「同じメールアドレスの扱い」を直し、Google ログインのたびに `user_metadata` が Google の値でマージされることを一行足す（research.md R-1〜R-3、quickstart.md「師匠の作業」）
- [ ] T021 [P] `.claude/rules/database.md` の `auth-errors.ts` の説明を、残す関数（Supabase Auth のエラーのログ用の要約と想定外の判定）に合わせて直す
- [ ] T022 Docker の `tools` で `pnpm check`・`pnpm lint`・`pnpm test:unit -- --run`・`pnpm test:e2e` を通す
- [ ] T023 quickstart.md の「師匠の作業」と「手で確かめること」を PR の本文で師匠に依頼する（FR-003, FR-004, FR-005, FR-011, FR-017 の実環境での確認。エージェントはダッシュボードと実の Google に触らない）

---

## Dependencies & Execution Order

- US1（T001〜T010）を先に行う。T007 で `/login` が `email-code-actions` を使わなくなり、T009 でコールバックが `post-login` を使わなくなるので、US2 の削除（T017・T018）は US1 のあと
- US2 の中では T015（/register がメールのコードを使わなくなる）のあとに T018
- 各ストーリーの中では、テスト（T001〜T006、T011〜T014）→ 実装の順。テストのタスクどうしは別ファイルなので並行してよい
- Polish（T020・T021）は US2 のあと。T022 は最後

## Parallel Example

```text
US1 のテスト: T001〜T006 を同時に
US2 のテスト: T011・T012・T013・T014 を同時に
Polish: T020・T021 を同時に
```

## Implementation Strategy

- MVP は US1。ここまでで Google だけのログインが成り立つ（/register やパスキーのコードはまだ残るが、/login からは使われない）
- US2 で自前の入口とコードを消し、Polish で文書を直して検証する。師匠のダッシュボード作業（T023）が終わるまで、認証基盤の側では Email とパスキーがまだ有効なことに注意（research.md R-3）
