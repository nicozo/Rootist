---
paths:
  - 'src/**/*.svelte'
  - 'src/**/*.svelte.ts'
---

# Svelte / UI

Svelte 公式プラグイン（`svelte@svelte`、`sveltejs/ai-tools`）をプロジェクトスコープで有効化している（`.claude/settings.json`）。初回は `/plugin marketplace add sveltejs/ai-tools` が必要。MCP は stdio 方式（`npx -y @sveltejs/mcp`）のため Node.js が前提。

- `.svelte` / `.svelte.ts` を書く前にスキル `svelte-core-bestpractices` を参照する。`svelte-code-writer` は MCP と機能が重複するため使わない
- Svelte MCP の `svelte-autofixer`（コード検証）で指摘ゼロにする。`get-documentation` / `list-sections` で公式ドキュメントを参照する。`playground-link` は使わない
- エージェント開発フロー: `generator` が Svelte ファイル変更後に `svelte-autofixer` を実行し、結果を `self_evaluation.md` に記録する。`evaluator` はその記録を証拠に判定する（evaluator は Svelte MCP を持たない）

## コンポーネント

- `src/lib/components/ui/` は shadcn/ui スタイルの自作コンポーネント群（bits-ui プリミティブ + tailwind-variants）
- 新しいコンポーネントは `tailwind-variants` で variants を定義し、`src/lib/utils.ts` の `cn()` でクラスをマージするパターンに従う
- `plan-timeline.svelte` は `/plan/result`（本人向け、クライアントストア依存）と `/plan/share/[shareId]`（SSR・認証不要）の両方で使う。どちらかの都合で壊さない
