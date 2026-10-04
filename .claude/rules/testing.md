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
