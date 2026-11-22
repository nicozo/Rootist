# Research: パスワードなしでアカウント登録・ログインする

spec: [spec.md](./spec.md) / plan: [plan.md](./plan.md)

## R1. メールのコードの方式

- **Decision**: Supabase Auth のメール OTP を使う。送信は `auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { name } } })`、確認は `auth.verifyOtp({ email, token, type: 'email' })`。どちらもサーバー（form action）で呼ぶ
- **Rationale**: 今の認証はサーバー用クライアント（`@supabase/ssr`、HttpOnly Cookie）だけで動いている。OTP は送信と確認の両方をサーバーで完結でき、Cookie の方式を変えずに済む。`shouldCreateUser: true` で、登録の有無に関係なく同じ応答になる（FR-024）。`data` はアカウント作成時だけ `user_metadata` に入るので、今の登録と同じ「@ より前」を表示名にできる（FR-006）。既存ユーザーには適用されず、表示名は変わらない（FR-007）
- **Alternatives considered**: マジックリンク（メールアプリ内ブラウザで PKCE の検証が失敗しやすく、スキャナーがリンクを先に消費する）。別の登録画面（`signUp`）を残す（手順が 2 つになり FR-006 の「同じ手順」に反する）

## R2. コードの桁数・有効期限・再送間隔

- **Decision**: ダッシュボードの Authentication → Providers → Email で「Email OTP Length = 6」「Email OTP Expiration = 600 秒」にする。再送間隔は Supabase 既定のメール送信間隔（同じアドレスに 60 秒）をそのまま使い、エラーコード `over_email_send_rate_limit` を FR-009 の表示に対応させる
- **Rationale**: 値をアプリに持たず、認証基盤の設定を正にする（SSoT）。アプリ側で同じ値を数えると食い違う
- **Alternatives considered**: アプリ側で送信時刻を Cookie に持って 60 秒を数える（基盤の制限と二重になる。画面の「あと何秒」表示が要るなら plan を直して追加する）
- **要確認（実装時）**: 再送で前のコードが無効になること（FR-010）、誤コードと期限切れがどちらも `otp_expired` で返ること。quickstart で実際の挙動を確かめる

## R3. メールの文面と送信

- **Decision**: ダッシュボードの Email Templates の「Magic Link」と「Confirm signup」を、`{{ .Token }}` を表示する日本語の文面にする（新規作成時は Confirm signup、既存ユーザーには Magic Link の文面が使われる）。本番は Custom SMTP（Resend 等）を設定する
- **Rationale**: 既定の文面はリンクだけでコードを含まない。標準のメール送信は 1 時間あたりの上限が小さく、本番の利用に足りない
- **担当**: ダッシュボードと SMTP の設定は師匠（エージェントは実値を扱えない）。手順は `docs/supabase-setup.md` に追記する

## R4. パスキーの方式

- **Decision**: Supabase Auth のパスキー（Beta、2026-05-28〜）の 2 段階 API（`auth.passkey.startRegistration` / `verifyRegistration` / `startAuthentication` / `verifyAuthentication`）をサーバーで呼び、ブラウザは WebAuthn の操作（`navigator.credentials.create` / `get`）だけを行う。登録済みかどうかは `auth.passkey.list()` で判定する
- **Rationale**: 1 段階の `registerPasskey()` / `signInWithPasskey()` はブラウザ用クライアントでセッションを読む必要があるが、今の認証 Cookie は HttpOnly でブラウザから読めない（`src/lib/server/supabase.ts` の方針 I-5）。2 段階 API なら challenge の発行と検証をサーバーで行え、`verifyAuthentication` でできたセッションはサーバーが HttpOnly Cookie に書ける。インストール済みの `@supabase/supabase-js` 2.119 の型で、これらのメソッドがあることを確かめた（`experimental.passkey` の旗は 2.119 で非推奨・既定で有効）
- **Alternatives considered**: ブラウザ用クライアントを導入して Cookie を HttpOnly でなくす（XSS でトークンが読まれる危険が増え、既存の方針 I-5 に反する）。自前で WebAuthn を実装する（認証基盤のユーザーとの結び付けを自分で持つことになり大きい）
- **オプションの受け渡し**: サーバーが返す options は JSON（base64url）。ブラウザでは `PublicKeyCredential.parseCreationOptionsFromJSON` / `parseRequestOptionsFromJSON` で変換し、結果は `credential.toJSON()` でサーバーへ返す。これらが無いブラウザはパスキー非対応と見なす（FR-019）
- **リスク**: Beta の API は予告なく変わる可能性がある。無料プランで設定が反映されない不具合の報告がある（[Discussion #46458](https://github.com/orgs/supabase/discussions/46458)）。パスキーが使えなくてもメールのコードと Google で入れるので、障害時の影響は「パスキーでログインできない」に限られる
- **ダッシュボード設定**: Authentication → Passkeys を有効にし、Relying Party ID（本番のドメイン）・Origins（本番と開発の origin）を設定する（師匠）

## R5. パスキー登録の案内の出し方と回数

- **Decision**: メールのコード・Google でログインした直後の行き先を、共通の関数で決める。パスキーが 0 件かつ見送り回数が 3 未満なら `/passkey`（案内の画面）へ、それ以外は `/plan` へ。見送り回数は `user_metadata.passkey_prompt_dismissals`（数値）に `auth.updateUser({ data })` で書く
- **Rationale**: 回数は本人の表示にしか影響しないので、本人が書き換えられる `user_metadata` で足りる。表を作らずに済み、マイグレーションが要らない。ブラウザの対応可否はサーバーで分からないので、案内の画面がブラウザで判定し、非対応なら回数を増やさずに `/plan` へ移る（FR-019）
- **Alternatives considered**: /plan の上にダイアログを出す（/plan の load とテストに認証の分岐が混ざる）。専用の表を作る（RLS とマイグレーションが要り、得るものが無い）

## R6. Google との同じアカウント

- **Decision**: Supabase の既定の自動リンク（確認済みの同じメールアドレスの identity を同じユーザーにまとめる）に任せ、アプリでは何もしない
- **Rationale**: Google のメールは確認済みとして扱われ、OTP で入ったメールも確認済みになるので、どちらの順でも同じユーザーになる（FR-020）
- **要確認（実装時）**: メール＋パスワードで作った既存ユーザー（Confirm email OFF のため未確認のまま）に Google で入ったとき、まとめられるか。未確認のユーザーは Supabase が自動リンクしない仕様のため、先に OTP で入って確認済みにすれば解消する。quickstart で確かめる
