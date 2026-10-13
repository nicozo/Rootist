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
