# Research: Google アカウントだけで登録・ログインする

確かめた日: 2026-11-24。Supabase Auth の挙動は公式ドキュメントとサーバー（supabase/auth）のソースで確かめた。SvelteKit は Svelte MCP の公式ドキュメントで確かめた。

## R-1. Google でログインし直すと、表示名（user_metadata）は Google の値で上書きされるか

- **Decision**: 上書きされる前提で設計する。この spec では読み方（`auth-user.ts` の `name` → `full_name` → メールのローカル部）を変えない（FR-005）。利用者が変えた表示名を保つ置き場所は RT-REQ-1 で決める（下の「RT-REQ-1 への申し送り」）
- **Rationale**: supabase/auth の `internal/api/external.go` では、既存の Google identity でのログイン（`AccountExists`）でも、同じメールアドレスの既存ユーザーへの自動リンク（`LinkAccount`）でも、Google から受け取った identity data を `user.UpdateUserMetaData(tx, identityData)` に渡している。`internal/models/user.go` の `UpdateUserMetaData` は丸ごとの置き換えではなく、キーごとのマージ（渡されたキーだけ書き、無いキーは残す。値が nil のキーは消す）
  - Google の identity data には `name`・`full_name`・`avatar_url`・`picture`・`email` などが入るので、`user_metadata.name` と `full_name`・`avatar_url`・`picture` はログインのたびに Google の値になる
  - Google が持たないキー（例: #189 の `passkey_prompt_dismissals`、RT-REQ-1 で足す独自のキー）はログインしても残る
- **RT-REQ-1 への申し送り**: 利用者が変えた表示名を `user_metadata.name` に書くと、次の Google ログインで消される。Google の identity data に無いキー名（例: `display_name`）か、アプリの DB の表に持ち、`resolveDisplayName` でそれを最初に読む必要がある。この spec では何も足さない
- **Alternatives considered**: この spec で表示名を独自のキーに移しておく案。今は表示名を変える手段が無いので、要件の無い先回りになる（原則 III）。採らない
- 出典: <https://github.com/supabase/auth/blob/master/internal/api/external.go>、<https://github.com/supabase/auth/blob/master/internal/models/user.go>

## R-2. 同じメールアドレスのアカウントは、Google でログインしたときに同じユーザーになるか（FR-004）

- **Decision**: Supabase Auth の自動リンク（既定）に任せ、アプリ側でリンクの処理は書かない（今の `docs/supabase-setup.md` の「同じメールアドレスの扱い」と同じ）
- **Rationale**: 公式ドキュメントに「Supabase Auth automatically links identities with the same email address to a single user.」とある。R-1 の `LinkAccount` の分岐がこれに当たる。サービスは未リリースなので、メールのコードで作られた既存アカウントの移行は保証しない（spec の前提）。挙動としては同じメールアドレスなら同じユーザーになる
- **Alternatives considered**: 手動リンク（`linkIdentity`）。Google だけになると、ログイン中に別の手段を足す場面が無いので要らない
- 出典: <https://supabase.com/docs/guides/auth/auth-identity-linking>

## R-3. メールのコードとパスキーを、認証基盤の側でも止める方法（FR-011, FR-013）

- **Decision**: アプリからはコードの送信・確認とパスキーの呼び出しを全部消す。そのうえで師匠が、Supabase ダッシュボードで Email プロバイダ（メール OTP）と Passkeys を無効にする（[quickstart.md](./quickstart.md)）
- **Rationale**: publishable key は公開の値なので、アプリから消しても Supabase Auth の `/auth/v1/otp` などは直接呼べてしまう。認証基盤の側で止めないと、アプリを通らずにメールのコードでアカウントを作れる。無効にすると、Supabase は `otp_disabled`（「Sign in with OTPs (magic link, email OTP) is disabled」）や `email_provider_disabled` を返す
  - Email プロバイダを無効にしても Google（OAuth）のログインと、同じメールアドレスでの自動リンクは使える（OAuth は `external.google` の設定で別に有効・無効が決まる）
- **Alternatives considered**: アプリだけ消す案。上の理由で FR-011 を満たしきれない
- 出典: <https://supabase.com/docs/guides/auth/debugging/error-codes>

## R-4. 消したフォームの送信（`/login?/sendCode` など）はどうなるか（FR-011）

- **Decision**: `src/routes/login/+page.server.ts` から `actions` を消す。`/register` は `+server.ts` の `GET` だけにする（R-5）
- **Rationale**: SvelteKit では form action は `+page.server.ts` の `actions` に書いたものだけが受け付けられる（Svelte MCP の「Form actions」）。`actions` が無いページへの POST は、SvelteKit が 405（No form actions exist for this page）を返す。`+server.ts` で `GET` だけを定義したときの POST も 405 になる。どちらも Supabase に届かないので、E2E で確かめられる（`.claude/rules/testing.md` の「Supabase に往復しない」を守れる）。405 になることは実装時にテストで確かめる
- パスキーの remote function（`src/lib/remote/passkey.remote.ts`）は、ファイルを消せば入口（`/_app/remote/<hash>/...`）も無くなる

## R-5. /register と /passkey の扱い（FR-009, FR-016）

- **Decision**:
  - `/register`: ページ（`+page.svelte`・`+page.server.ts`）を消し、`src/routes/register/+server.ts` の `GET` で `/login` へ 308 で移す。ログイン済みなら `/login` の load がさらに `/plan` へ移す（FR-008）
  - `/passkey`: ルートごと消す。SvelteKit の既定の 404 になる（FR-016）
- **Rationale**: `/register` は古いリンク・ブックマークがあり得るので移す。ページのファイルを残さずに済む `+server.ts` が最小。308 は「恒久的に移った」の意味で、メソッドを変えない（POST は `GET` しか無いので 405 のまま）。`/passkey` はログイン直後に限って出していた画面で、外から開かれる理由が無い
- **Alternatives considered**: `/register` を 404 にする案（迷わせる）。`hooks.server.ts` の `reroute` で書き換える案（URL が `/register` のまま残り、移ったことが分からない）

## R-6. Google ログインが使えない環境での表示（FR-012）

- **Decision**: `isGoogleAuthEnabled`（`GOOGLE_AUTH_ENABLED=true` のときだけ真）が偽なら、ログイン画面にボタンを出さず「現在ログインできません。」と出す。フラグの正はこれまでどおり `.env.example` と `src/lib/server/supabase.ts`
- **Rationale**: CI と `tools` は `GOOGLE_AUTH_ENABLED=` で動く。ログインの手段がほかに無くなるので、何もない画面にしない。E2E は環境で結果が変わる確認を入れない決まりなので、Vitest のクライアントテストで両方の場合を確かめる

## R-7. #189 で入れたものの後始末

- **Decision**: 次を消す。`email-code-actions.ts`、`email-code-form.svelte`、`passkey.ts`、`post-login.ts`、`passkey-client.ts`、`passkey.remote.ts`、`schemas/passkey.ts`、`routes/passkey/`、それぞれのテスト。`auth-errors.ts` は `hooks.server.ts` が使う `describeAuthError`・`isUnexpectedAuthError` だけを残し、メールのコード用の文言と関数を消す
- `user_metadata.passkey_prompt_dismissals` は読まなくなるだけで、消さない（未リリースで、残っても害が無い。Google のログインでも消えない＝R-1）
- 利用者が Supabase に登録したパスキーは、ダッシュボードで Passkeys を無効にすれば使われない。開発中のテストユーザーごと消す場合は `docs/supabase-setup.md` の既存の手順（Authentication > Users）
- **Rationale**: SSoT。使われないコードと文言を残さない
