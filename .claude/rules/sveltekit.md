---
paths:
  - 'src/**'
  - 'vite.config.ts'
  - 'tsconfig.json'
  - 'package.json'
---

# SvelteKit 3 の規約

SvelteKit 3 を使っている。2 系の書き方を持ち込まない。個々の API の使い方は Svelte MCP（`get-documentation`）で確認する。ここにはこのリポジトリで決めた方針だけを書く。

非推奨の API は `svelte-check` では警告されないので、`pnpm lint` が検出する。`.ts` は `eslint.deprecated.config.js`（型情報つきの `no-deprecated`）、`.svelte` を含む全体は `eslint.config.js` の `no-restricted-imports`（移行で廃止・非推奨になったものを名指し。一覧は設定が正）。`.svelte` は型情報つきの検査をしていない（広げると lint が数分かかる）ので、名指しの一覧にない非推奨 API は検出されない。

- lib の import は `#lib`（`package.json` の `imports`。`#lib/server/supabase.js` のように拡張子 `.js` を付ける）。`$lib` は使わない
- 設定の置き場所: SvelteKit・Vite・Vitest・フォーマッタは `vite.config.ts`（`svelte.config.js` は無い）、TypeScript の対象範囲（`include`）は `tsconfig.json`。同じ設定を両方に書かない
- 環境変数は `src/env.ts` で宣言し、`$app/env/private` から読む（`$env/*` は使わない）。名前の正は `.env.example` で、一致は `src/env.test.ts` が検査する。必須の変数は schema が throw して宣言する（build 時と起動時に、足りない変数がまとめて表示される）。利用時必須の変数は schema では `undefined` で通し、使う側で検知する（起動は妨げない）。`building` で build 時だけ任意にする方式は使わない（モジュール読み込み時に値を使うため、環境変数なしの build はどのみち通らない）
- 外部 URL への `redirect` は、宛先の origin を `external: [origin]` で許可し、`external: true` は使わない。呼ぶ前に origin を検査し、許可外なら内部ページへ戻す（許可外だと `redirect` が例外で 500 になるため。例: `src/routes/auth/google/+page.server.ts`）
- remote functions（experimental）は `src/lib/remote/*.remote.ts` に置く（`#lib/remote/….remote.js` で import。opt-in は `vite.config.ts` の `sveltekit()`）。このファイルは「valibot スキーマ + 本体の呼び出し」だけの薄い層にし、スキーマは `src/lib/schemas/`、ロジックは `src/lib/server/` に置く。外部 API を叩く・DB に書く関数は GET の `query` ではなく `command`（POST）にする（`query` はクロスサイト検査の対象外）。`.remote.` を名前に含むテストファイルは作らない（remote module と見なされる）
