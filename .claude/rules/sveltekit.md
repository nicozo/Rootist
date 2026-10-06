---
paths:
  - 'src/**'
  - 'vite.config.ts'
  - 'tsconfig.json'
  - 'package.json'
---

# SvelteKit 3 の規約

SvelteKit 3 を使っている。2 系の書き方を持ち込まない。

- lib の import は `#lib`（`package.json` の `imports`。`#lib/server/supabase.js` のように拡張子 `.js` を付ける）。`$lib` は使わない
- 設定の置き場所: SvelteKit・Vite・Vitest・フォーマッタは `vite.config.ts`（`svelte.config.js` は無い）、TypeScript の対象範囲（`include`）は `tsconfig.json`。同じ設定を両方に書かない
- 環境変数は `src/env.ts` で宣言し、`$app/env/private` から読む（`$env/*` は使わない）。名前の正は `.env.example` で、一致は `src/env.test.ts` が検査する。`src/env.ts` の schema では throw せず（build を落とさない）、未設定（未定義・空文字）の検知は利用側で行う。必須の変数はモジュール読み込み時、利用時必須の変数は API 呼び出し時
- API の応答は `Response.json()` / `new Response()` を使う（`json()` / `text()` は非推奨）
- ナビゲーション後の再取得は `refreshAll`（`invalidateAll` は非推奨）。`goto` の宛先は内部ルート（`resolve()` を通す）
- 外部 URL への `redirect` は既定で拒否される。必要な宛先だけ `redirect(303, url, { external: [origin] })` で許可し、`external: true` は使わない。許可外の URL は `redirect` が例外（500）になるので、呼ぶ前に origin を検査して内部ページへ戻す（例: `src/routes/auth/google/+page.server.ts`）
