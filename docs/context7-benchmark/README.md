# Context7 あり／なし 狙い撃ち比較（C）

issue #127 の「C. 狙い撃ち比較」の整備物。**このディレクトリは「いつでも同じ条件で実施できる状態」までの整備であり、あり／なしの実測は本 issue では実施していない。実測は別 issue で行う**（観察ログ A の結果を見てから着手する。issue 補足の実施順 A → C に従う）。判断（継続／使用ルール改善／撤去）も本 issue では下していない。判断の枠組みは [docs/context7-measurement.md](../context7-measurement.md) の判断マトリクスを使う。

## 構成

| ファイル              | 内容                                                            |
| --------------------- | --------------------------------------------------------------- |
| `tasks/C7-SB-01.md`   | Supabase 系（`@supabase/supabase-js` Auth の `verifyOtp`）      |
| `tasks/C7-TW-01.md`   | Tailwind CSS v4（`@utility` / `@custom-variant`）               |
| `tasks/C7-BU-01.md`   | bits-ui v2（`Switch`）                                          |
| `tasks/C7-DZ-01.md`   | drizzle-orm（`pgEnum` / 外部キー / `index` の配列形。任意課題） |
| `results-template.md` | 結果表のテンプレート（1 行 = 1 試行）と集計欄                   |

各課題ファイルに、課題 ID・題名・対象バージョン（package.json と lockfile）・起点コミット・依頼文全文・完了条件・正解の根拠（正しい API と廃止／存在しない API の参照表と出典）・起点コミットに同じ API の使用例が無いことの確認結果・判定用テストが固定されている。

## 判定基準（正答率を同じ基準で判定する）

各試行を次の 7 項目で採点する。各項目は「合格／不合格／判定不能」で記録する。判定は差分とコマンド出力だけで行い、判定者がどちらの条件かを知らなくても採点できる形にする（可能なら条件を伏せて採点する）。

| #   | 項目                             | 判定方法                                                              |
| --- | -------------------------------- | --------------------------------------------------------------------- |
| 1   | 型エラーなし                     | `pnpm check` の結果                                                   |
| 2   | lint 通過                        | `pnpm lint` の結果                                                    |
| 3   | テスト通過                       | 課題の判定用テストを投入した状態での `pnpm test:unit -- --run` の結果 |
| 4   | 存在しない API の使用なし        | 生成差分を課題ファイルの参照表（「存在しない API」）と照合する        |
| 5   | 廃止（deprecated）API の使用なし | 生成差分を課題ファイルの参照表（「廃止」）と照合する                  |
| 6   | 取得ドキュメントのバージョン一致 | 「あり」条件のみ。下記「バージョン一致の確認方法」                    |
| 7   | 課題の完了条件を満たす           | 課題ファイルの完了条件                                                |

- **正答の定義**: 1〜5 と 7 がすべて合格なら正答。6 は正確性の補助指標で、正答判定には含めない。
- **正答率** = 正答した試行数 ÷ 試行数。条件 × 課題ごと、および条件ごとの合計の両方を出す。
- 判定不能が 1 つでもある試行は、理由を備考に書き、正答率の分母から外すか不正答に数えるかを集計欄の「判定不能の扱い」に明記する。

### バージョン一致の確認方法（項目 6）

1. 集計スクリプトで、その試行のセッション記録から Context7 の `query-docs` の対象ライブラリ ID と回数を取る。ベンチの試行は `bench/c7-` ブランチなので、集計の「ベンチ」行に出る（`--calls` を付けると呼び出し一覧が見える）。
2. 取得したライブラリ ID（例: `/supabase/supabase-js`）と、返ったドキュメントの対象バージョンが、課題ファイルの package.json バージョン・lockfile 実バージョンと合うかを、試行中の実装エージェントの `self_evaluation.md`（`## Context7 使用記録` 節の「取得ドキュメントのバージョン一致」列）の申告と照らして判定する。
3. 申告が `不明` のとき、または照合できないときは「不明」と記録する（合格・不合格に倒さない）。

## 条件の統制方法

- **あり**: Context7 の 2 ツール（`mcp__MCP_DOCKER__resolve-library-id` / `mcp__MCP_DOCKER__query-docs`）が使える状態。
- **なし**: 上の 2 ツールが**使えない**状態。**依頼文で「使うな」と指示するのではなく、ツールの有無で統制する**。具体的な実現方法（例: 計測用の実装エージェント定義を用意し、`tools:` から Context7 の 2 ツールを外す）は実施 issue で決めてよい。
- 両条件で共通にするもの: 同じモデル、同じ起点コミット、同じ依頼文、WebFetch / WebSearch の扱い（初期案は**両条件とも使えない状態**。Context7 と記憶の比較に絞るため）。Svelte MCP は両条件で利用可。
- 試行回数: 課題 × 条件ごとに複数回（目安 3 回）。実行順は条件を交互にする（例: あり1 → なし1 → あり2 → なし2 …）。
- ベンチ実行のブランチ名は集計 A と混ざらない固定の接頭辞 `bench/c7-` を使う（例: `bench/c7-<課題ID>-<あり|なし>-<回>`）。**push しない・PR を作らない・終了後に worktree を削除する**。
- **実施後の確認**: 「なし」試行の Context7 呼び出しが **0 件**であることを、下の「「なし」試行の呼び出し 0 件の確認」の手順で確認する（0 でなければ統制が崩れているので、その試行は無効にして再実施する）。

## 「なし」試行の呼び出し 0 件の確認（ベンチ記録の gitBranch のずれ対策）

集計は行ごとの `gitBranch` で issue に紐付ける。実装エージェントのセッションの cwd がベンチ worktree でないと、記録の `gitBranch` が `main` になり、呼び出しが集計の「ベンチ」行ではなく「issue 不明」に入る。**この状態では、「ベンチ」行だけを見て 0 件と判断すると、統制が崩れていても合格に見える**（このリポジトリの #127 の generator で実際に起きた。Context7 を 8 回使ったのに #127 の行は 0 件だった）。次の 3 点を守る。

1. **試行は、ベンチ worktree を cwd とする独立した Claude Code セッションで実施する**。メインのワーキングツリーから起動したサブエージェントでは行わない。
2. **判定の前に、その試行の記録の `gitBranch` が `bench/c7-<課題ID>-…` であることを確かめる**。`pnpm metrics:context7 -- --dir <その試行の記録だけを置いたディレクトリ> --calls` を実行し、「ベンチ」行の期間・トークン・所要時間が空でない（`—` でない）ことを見る。「ベンチ」行が出ない、または空の試行は**無効**とし、再実施する。
3. **0 件の確認は「ベンチ」行だけで判断せず、その試行の記録ファイル全体で Context7 の呼び出しが 0 件であることを確認する**。手順: その試行のセッション記録（`<session-id>.jsonl` と `<session-id>/subagents/`）だけを新しいディレクトリにコピーし、`--dir` にそのディレクトリを指定して集計する。出力の全行（「issue 不明」「ベンチ」を含む）の `resolve` と `query-docs` がすべて 0 であること。別の確認として、同じ記録に対して `grep -cE '"type":"tool_use","id":"[^"]+","name":"mcp__MCP_DOCKER__(resolve-library-id|query-docs)"' <記録ファイル>` が 0 であることも見る。

## 実施手順書

1. **前提確認**: Docker MCP Gateway の接続（`docker mcp` の状態）、Context7 の API キーの有効性（実際に `resolve-library-id` を 1 回呼んで確認）、Node / pnpm の版、集計スクリプトが動くこと（`pnpm metrics:context7 -- --dir <記録ディレクトリ>` が成功する）を確認し、セットアップにかかった分数を記録する（結果表の「セットアップ手間」）。
2. **課題ごとの使い捨て worktree を作る**: `git worktree add -b bench/c7-<課題ID>-<あり|なし>-<回> <作業パス> <起点コミット>`（起点コミットは課題ファイルの値。`main` の最新ではない）。`.env` をコピーし `pnpm install` する。
3. **条件を設定する**（試行は上の 1. のとおり、ベンチ worktree を cwd とする独立したセッションで行う）: 「あり」は通常の実装エージェント、「なし」は Context7 の 2 ツールを持たない計測用のエージェント定義で実施する。
4. **判定用テストは見せない**: 実装エージェントには判定用テストの内容を渡さない（実装後に投入する）。
5. **依頼文を投入する**: 課題ファイルの依頼文を**一字一句そのまま**渡す。追加の指示や助言はしない。
6. **終了後に判定コマンドを実行する**: 判定用テストを指定パスに置いたうえで `pnpm check` / `pnpm lint` / `pnpm test:unit -- --run`（課題のテストを含む）を実行する。生成差分を参照表と照合する。
7. **集計スクリプトで記録を取る**: セッション記録から Context7 の呼び出し数・トークン・所要時間を取る（「ベンチ」行。トークン・所要時間は A と同じ算出方法）。「なし」試行の呼び出し 0 件を、上の 2.・3. の手順で確認する（「ベンチ」行だけで判断しない）。
8. **結果表に記入する**: `results-template.md` のコピーに 1 試行 1 行で記録する。
9. **後片付け**: worktree とブランチを削除する（`git worktree remove`、`git branch -D`）。作成したデータがあれば削除する。
10. **判断マトリクスへの当てはめ**: 集計欄の値を [判断マトリクス](../context7-measurement.md#判断マトリクス) に入力し、結論と根拠を判断記録に残す。

## 固定時の確認（この issue で実施済み）

固定した 4 課題の判定用テストが「壊れていない」ことを、スクラッチの使い捨て worktree（ブランチ名は `bench/c7-` 以外の `scratch/` 接頭辞。確認後に削除）で確認した。参照実装は**コミットしていない**（リポジトリに入っていない）。

- 起点コミット `1605b27ef5085193b104d24e6aeb6cd8bba23c41` のまま判定用テストだけを置くと、4 ファイルとも失敗する（red）:

```
FAIL  |server| src/lib/styles/utilities.test.ts [ src/lib/styles/utilities.test.ts ]
Error: ENOENT: no such file or directory, open 'src/lib/styles/utilities.css'
 FAIL  |server| src/lib/server/db/plan-comments.test.ts [ src/lib/server/db/plan-comments.test.ts ]
TypeError: Cannot read properties of undefined (reading 'Symbol(drizzle:Columns)')
 FAIL  |server| src/routes/auth/confirm/server.test.ts [ src/routes/auth/confirm/server.test.ts ]
Error: Cannot find module './+server' imported from src/routes/auth/confirm/server.test.ts
 FAIL  |server| src/lib/components/ui/switch/switch.test.ts [ src/lib/components/ui/switch/switch.test.ts ]
Error: Cannot find module './index' imported from src/lib/components/ui/switch/switch.test.ts
 Test Files  4 failed (4)
      Tests  no tests
```

- 参照実装を置くと全件通る（green）:

```
 Test Files  4 passed (4)
      Tests  26 passed (26)
```

- 参照実装は `svelte-check`（0 エラー）、`eslint`、`vp fmt --check` も通した。

## 注意

- 課題は「リポジトリ内の既存コードを写せば解ける」ものにしない原則で選んだ。既存に近い例（`/auth/callback`、`ui/toggle`、`layout.css` の `@custom-variant dark`、`plans` テーブル）は各課題ファイルに明記した。
- 課題の依頼文・判定用テストを変更したら、課題 ID に版（`-v2` など）を付けて別課題として扱い、版をまたぐ比較をしない。
- 判定用テストが通ることは「API が存在し動く」ことの確認であり、廃止 API を使っていないこと（項目 5）は差分と参照表の照合で行う。
