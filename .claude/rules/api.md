---
paths:
  - 'src/routes/**/+server.ts'
  - 'src/lib/remote/**'
  - 'src/lib/schemas/**'
  - 'openapi/**'
---

# API の入出力の SSoT

API の入力と出力の形（項目・型・必須・エラーの形）は、種類ごとに決めた 1 か所だけに書き、型・検査・文書はそこから導出する。

| 種類                              | 入出力の正                               | 書く順序                                                     |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| REST API（`+server.ts`）          | OpenAPI（`openapi/openapi.yaml`）        | OpenAPI を先に書き、レビューを通してから `+server.ts` を書く |
| remote functions（`*.remote.ts`） | valibot のスキーマ（`src/lib/schemas/`） | スキーマを先に書き、remote function はそれを参照する         |

## REST API（`+server.ts`）

- 対象は、JSON などのデータを受け取る・返す HTTP API。リダイレクトだけを返す入口（例: `src/routes/auth/callback/+server.ts`）は対象外
- 実装の前に `openapi/openapi.yaml` に、パス・メソッド・リクエスト・レスポンス（エラーを含む）を書く。plan.md の `contracts/` には写さず、このファイルへのリンクを書く
- TypeScript の型・入力検査は OpenAPI から生成・導出し、同じ形を手で書き直さない（生成の方法は、最初の REST API を作るときに決めてこのファイルに書く）
- 入出力を変えるときは、先に OpenAPI を直す

## remote functions（`src/lib/remote/*.remote.ts`）

- 画面とサーバーの間の内部の RPC で、OpenAPI の対象外
- 入出力の形は `src/lib/schemas/` の valibot のスキーマが正。型は `v.InferInput` / `v.InferOutput` で導出し（例: `src/lib/schemas/plans.ts` の `SavePlanInput`）、同じ形の型を手で書かない
- 今あるスキーマは入力だけで、出力はサーバー側の関数の戻り値の型をそのまま使っている。出力の形を画面と取り決める必要が出たら、スキーマに書いてそこから導出する
- 置き場所・薄い層にする方針は `.claude/rules/sveltekit.md` の remote functions の項
