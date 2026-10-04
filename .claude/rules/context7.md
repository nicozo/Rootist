---
paths:
  - 'package.json'
  - 'src/**'
---

# Context7（ライブラリドキュメント参照）

Context7 を Docker MCP Gateway の `rootist` プロファイル経由で導入している（セットアップは `docs/docker-mcp-toolkit.md`）。API キーは Docker のシークレット `context7.api_key` で管理し、リポジトリには含めない。

- **使い分け**: Svelte / SvelteKit は Svelte MCP を優先する。Context7 はそれ以外のライブラリ（@supabase/ssr / @supabase/supabase-js / postgres / bits-ui / Tailwind CSS v4 / vite-plus / Gemini API / Google Places API など）の最新ドキュメント参照に使う
- **使い方**: `resolve-library-id` でライブラリ ID を解決 → `query-docs` でドキュメントを取得する。package.json のバージョンに合った情報を参照する
- **付与範囲**: `generator` のみ（planner / evaluator は実装詳細に踏み込まないため付与しない）
- **導入効果の計測**: 使用場面の定義・使用記録・集計スクリプト・台帳・あり/なしの比較手順は `docs/context7-measurement.md` を参照
