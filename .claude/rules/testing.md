---
paths:
  - '**/*.test.ts'
  - 'e2e/**'
  - 'vite.config.*'
  - 'vitest*.config.*'
  - 'playwright.config.*'
---

# テスト分類

- `*.svelte.test.ts` — クライアントテスト（Playwright ブラウザ上で Vitest 実行）
- `*.test.ts` — サーバーテスト（Node 環境）
- `e2e/` — Playwright E2E テスト
- 環境変数（`$app/env/private`）のモックは `src/lib/server/test-utils/mock-env.ts` に統一する（使い方はそのファイル冒頭）。テストごとに別の方法で差し替えない

## 役割

| 層                  | 確認すること                                                                                                                                                | 確認しないこと                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Vitest サーバー     | API・load・アクションの入出力の契約、入力チェック、認証状態による分岐、SQL（パラメータ化・表と列）、外部 API への送り方とエラーの扱い                       | 画面の見た目、画面遷移                                         |
| Vitest クライアント | 1 画面・1 コンポーネントの表示、状態の変化（入力・追加・削除・排他）、エラー表示の種類、送信の中身、アクセシビリティ（ラベル・ロール）                      | 実際のルーティング、サーバーとの結合、Cookie                   |
| E2E                 | URL のルーティング（直接アクセス・リダイレクト・404）、hydration 後に操作できること、画面間の移動と状態の受け渡し、Cookie・サーバー・レイアウトを通した結合 | 上の 2 層で確認できる分岐。外部 API・Supabase・DB の実際の往復 |

## 原則

- 同じ観点を二重に持たない。まず Vitest で確認できないかを考え、E2E には Vitest で確認できないもの（ルーティング・hydration 後の動作・画面遷移・Cookie の結合）だけを置く
- E2E は画面ごとに 1 ファイル（`e2e/<画面>.test.ts`）で、主な導線だけを確認する。画面をまたぐ横断の確認は内容が分かる名前の別ファイルにする（例: `auth-cookie.test.ts`）
- E2E は CI と同じダミー環境変数でも、手元の実 `.env` でも、同じ結果で通す。環境によって結果が変わる確認は入れない
- E2E から Supabase（Auth・DB）に実際に往復しない
- 外部 API と DB 保存の API（`/api/places`・`/api/route`・`/api/plans`）は、ブラウザ側で横取りしてモックする。モックしていない `/api/*` は失敗させる（課金と共有 DB への書き込みを防ぐ。仕組みは `e2e/helpers.ts`）
- E2E の共通処理はテストではない共通ファイル（`e2e/helpers.ts`）に置き、コピーしない

## 既知の範囲外

- 共有プランの正常表示は E2E では確認しない（DB を読む load はブラウザ側で差し替えられないため）。Vitest の load のテストと表示のテストが担当する

## 実行

- `pnpm test:e2e` は本番ビルドをポート 4173 で起動してから実行する。CI と同じ条件: `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=ci-dummy-publishable-key GOOGLE_MAPS_API_KEY= GEMINI_API_KEY= GOOGLE_AUTH_ENABLED= pnpm test:e2e`
