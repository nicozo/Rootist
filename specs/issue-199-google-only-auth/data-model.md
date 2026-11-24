# Data Model: Google アカウントだけで登録・ログインする

アプリの DB（`supabase/migrations/`）の変更は無い。アカウントは Supabase Auth のユーザー（`auth.users`）のまま。

## アカウント（Supabase Auth のユーザー）

| 項目            | 中身                                                                            | この spec での変化                                                                                                  |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`            | UUID。今は `plans` にひも付かない（プランはアカウントと無関係に作れる。FR-017） | 変わらない                                                                                                          |
| `email`         | Google アカウントのメールアドレス。1 つのアドレスに 1 ユーザー                  | 変わらない。同じアドレスなら Google でも同じユーザー（[research.md](./research.md) R-2）                            |
| identities      | どの手段で入れるか                                                              | 新しく作られるユーザーは `google` だけ。メールのコードで作られたユーザーは Google で入ると `google` が足される      |
| `user_metadata` | `name`・`full_name`・`avatar_url`・`picture` など（Google が入れる値）          | 読み方は変えない（FR-005、`src/lib/server/auth-user.ts`）。Google ログインのたびに Google の値でマージされる（R-1） |

- `user_metadata.passkey_prompt_dismissals`（#189）: アプリが読まなくなる。消さない（R-7）
- パスキー（Supabase Auth のパスキー）: アプリから使わなくなる。ダッシュボードで無効にする（R-3）
