# Contract: 認証まわりの URL

この spec のあとの、認証に関わる URL の振る舞い。根拠は [research.md](../research.md)。

| URL                        | メソッド | ログイン状態 | 応答                                                                                                     | 要件                  |
| -------------------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------- | --------------------- |
| `/login`                   | GET      | 未ログイン   | 200。Google が有効なら「Googleでログイン」だけ、無効なら「現在ログインできません。」。入力欄は無い       | FR-001, 002, 012      |
| `/login`                   | GET      | ログイン済み | 303 → `/plan`                                                                                            | FR-008                |
| `/login?error=google`      | GET      | 未ログイン   | 200。「Googleログインを完了できませんでした。もう一度お試しください。」                                  | FR-007                |
| `/login?/sendCode` など    | POST     | どちらでも   | 405（form action が無い）。Supabase に届かない                                                           | FR-011                |
| `/register`                | GET      | どちらでも   | 308 → `/login`                                                                                           | FR-009                |
| `/register?/sendCode` など | POST     | どちらでも   | 405。Supabase に届かない                                                                                 | FR-011                |
| `/passkey`                 | GET      | どちらでも   | 404                                                                                                      | FR-016                |
| `/auth/google`             | POST     | 未ログイン   | 今のまま（Google が有効なら Supabase の認可 URL へ 303、無効なら 404、失敗は `/login?error=google`）     | FR-001, 007           |
| `/auth/callback`           | GET      | —            | 交換に成功したら 303 → `/plan`（パスキーの案内を挟まない）。失敗・取り消しは 303 → `/login?error=google` | FR-003, 004, 007, 014 |

- ヘッダー（`src/routes/+layout.svelte`）: 未ログインなら「ログイン」のリンクだけ（FR-010）
- パスキーの remote function（`passkey.remote.ts` の 4 つ）は無くなる（FR-013）
