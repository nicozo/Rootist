# Quickstart: Google アカウントだけで登録・ログインする

## 自動の検証（エージェント）

CLAUDE.md の「Commands」のとおり Docker の `tools` で `pnpm check`・`pnpm lint`・`pnpm test:unit -- --run`・`pnpm test:e2e` を通す。URL ごとの期待は [contracts/routes.md](./contracts/routes.md)。

## 師匠の作業（Supabase ダッシュボード。マージの前後どちらでもよいが、本番に出す前に必ず）

根拠は [research.md](./research.md) R-3。手順の本文は `docs/supabase-setup.md` の「9. 認証（Supabase Auth）の設定」に書く（この spec の実装で直す）。

1. Authentication > Sign In / Providers > **Email** を無効にする（メールのコードでの登録・ログインを止める）
2. Authentication > **Passkeys** を無効にする
3. Authentication > Sign In / Providers > **Google** が有効なことを確かめる（`docs/supabase-setup.md` の「11. Google ログイン」）
4. 確認: `/auth/v1/settings` の `external.email` が `false`、`external.google` が `true`

## 手で確かめること（師匠。実の `.env` で `GOOGLE_AUTH_ENABLED=true`）

| 確かめること                                                                          | 期待                                                                                         | 要件             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| `/login` を開く                                                                       | 「Googleでログイン」だけ。メールアドレスの欄もパスキーのボタンも無い                         | FR-001, 002, 013 |
| まだ使っていない Google アカウントでログイン                                          | アカウントができて `/plan`。メニューに Google の名前                                         | FR-003, 005      |
| ログアウトして同じ Google アカウントでもう一度ログイン                                | Supabase の Authentication > Users で同じユーザーが 1 人のまま。メニューに同じメールアドレス | FR-004           |
| Google の画面で取り消す                                                               | `/login` にエラーの文言                                                                      | FR-007           |
| ログアウトしたまま `/plan` でプランを作り、結果と共有ページを開く                     | ログインを求められない                                                                       | FR-017           |
| `/register` を開く                                                                    | `/login` に移る                                                                              | FR-009           |
| 上の 1 のあとに、Supabase の `/auth/v1/otp` へ publishable key でメールのコードを頼む | エラー（`otp_disabled` か `email_provider_disabled`）でメールは届かない                      | FR-011           |
