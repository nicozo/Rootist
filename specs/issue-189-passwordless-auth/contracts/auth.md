# Contracts: 認証の入口

REST API（`+server.ts` の JSON API）は追加しないので OpenAPI の変更は無い。form action と remote function の入出力の正は次のとおりで、ここには形を写さない（`.claude/rules/api.md`）。

## form actions

| 入口                                          | 入力                 | 結果                                                                                  | 要件                                |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| `/login?/sendCode`・`/register?/sendCode`     | email                | 成功: `step: 'code'` と email。失敗: `fail(400)` と固定の日本語メッセージ             | FR-003, FR-009, FR-011, FR-023〜025 |
| `/login?/verifyCode`・`/register?/verifyCode` | email、code（6 桁）  | 成功: 行き先（`/passkey` か `/plan`）へ 303。失敗: `fail(400)`、`step: 'code'` のまま | FR-005〜008, FR-022                 |
| `/passkey?/dismiss`                           | なし（ログイン必須） | 見送り回数を 1 増やして `/plan` へ 303                                                | FR-015, FR-027                      |

- メッセージの文言は `src/lib/server/auth-errors.ts` に置き、エラーコードとの対応もそこで持つ（今の方式を引き継ぐ）

## remote functions（`src/lib/remote/passkey.remote.ts`。すべて `command`）

| 関数                        | 入力の正（`src/lib/schemas/passkey.ts`） | 出力                                                 | 要件           |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------- | -------------- |
| `startPasskeyRegistration`  | なし（ログイン必須）                     | challengeId と WebAuthn の作成オプション（JSON）     | FR-014         |
| `verifyPasskeyRegistration` | challengeId、credential（JSON）          | 成否                                                 | FR-014, FR-016 |
| `startPasskeyLogin`         | なし                                     | challengeId と WebAuthn の要求オプション（JSON）     | FR-017         |
| `verifyPasskeyLogin`        | challengeId、credential（JSON）          | 成否（成功時はサーバーがセッションの Cookie を書く） | FR-017, FR-018 |

- credential の中身は WebAuthn の JSON 形式で、検査は Supabase Auth が行う。スキーマは「文字列の challengeId」と「オブジェクト」の形だけを確かめる
