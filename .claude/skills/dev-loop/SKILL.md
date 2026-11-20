---
name: dev-loop
description: 承認済みの spec（specs/ の spec.md・plan.md・tasks.md）を入力に、Generator → QA の2エージェントで実装と判定を自動化するループを実行する。テストを先に書く TDD を検証の段で機械的に確かめ、完了は spec.md の受け入れシナリオだけで判定する。ユーザーが「/dev-loop」または issue からの自動開発を明示的に依頼したときのみ使用。
argument-hint: <issue番号>
disable-model-invocation: false
---

# dev-loop — spec 駆動 2エージェント自動開発ループ

承認済みの spec を入力に、Generator（実装）→ QA（判定）の2エージェントで開発を進めるオーケストレーションスキル。あなた（メインセッション）はオーケストレーターとして振る舞い、自分ではコードを書かない。エージェントの起動・ファイル連携の仲介・検証コマンドと TDD 確認の実行・devサーバー管理・git/PR操作だけを行う。

**何を作るかは spec.md、どう作るかは plan.md と tasks.md が正**。ループの中で仕様や受け入れ基準を作り直さない（spec と二重になり、完了の基準が二つに分かれるため）。全機能に共通の品質ルール（svelte-autofixer、Context7 の使用場面、テストの置き場所など）は CLAUDE.md と `.claude/rules/` が正で、spec ごとの合意事項にはしない。

## 使い方

```
/dev-loop <issue番号>
```

引数が無ければ `gh issue list --state open` を表示してユーザーに選ばせる。spec の無い要望（issue 番号なしのテキスト）は受け付けない。先に `issue-writer` で issue と spec を作る。

## 登場エージェント（Agentツールの subagent_type）

| 役割      | subagent_type | 入力                                     | 成果物                                                                    |
| --------- | ------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Generator | `generator`   | spec.md・plan.md・tasks.md               | テストだけのコミット → 実装のコミット、`self_evaluation.md`、`handoff.md` |
| QA        | `evaluator`   | spec.md の受け入れシナリオ・`handoff.md` | `qa_report_iter<N>.md`（要件 ID ごとの PASS / FAIL）                      |

**重要な制約**: QAはBashを持たない。devサーバーの起動・停止は必ずオーケストレーターが行うこと。エージェント間の連携はすべてワークスペース内のファイル経由で行われる。各エージェントは `run_in_background: false` で同期実行し、2回目以降の呼び出しは新規spawnではなく **SendMessage** で同じエージェントに継続依頼する（コンテキスト維持のため）。

## ワークフロー

以下のチェックリストを応答にコピーし、進捗に合わせてチェックする:

```
dev-loop 進捗:
- [ ] Step 0: 前提確認（spec の承認・worktree）
- [ ] Step 1: Generator — テスト → 実装・引き渡し
- [ ] Step 2: 検証（検証コマンド・TDD 確認）
- [ ] Step 3: QA評価（イテレーションN）
- [ ] Step 4: 判定（PASSまで Step 1〜3 を反復）
- [ ] Step 5: レビュー・コミット・PR・マージ監視
```

用語: **メインのワーキングツリー** はリポジトリ本体のチェックアウト、**worktree** は開発用に `.claude/worktrees/issue-<N>` に作る作業ディレクトリを指す（CLAUDE.md の方針により、実装は必ず worktree で行う）。

### Step 0: 前提確認

1. メインのワーキングツリーで `git status` — dirtyなら中断してユーザーに報告（自動stash禁止）
2. `gh issue view <N> --json number,title,body,url` で issue を取得し、本文の `spec:` 行から spec のフォルダ `specs/issue-<N>-<スラッグ>/` を得る。行が無い・`<番号>` のままなら中断して報告する
3. worktree を用意する: `issue-writer` が作った `.claude/worktrees/issue-<N>`（ブランチ `<type>/issue-<N>-<スラッグ>`）があればそれを使う。無ければリモートのブランチから `git worktree add .claude/worktrees/issue-<N> <ブランチ>` で作り、`pnpm -s worktree-env setup <N>` を実行する（`.env` は読まず、必ずこのコマンドで準備する。理由・範囲は .claude/rules/agent-env-access.md）。終了コードが 0 以外なら中断して報告する。EnterWorktree（`path` 指定）でセッションを worktree に移す
4. **spec の承認を確かめる**（何を作るかが確定していないまま実装しないため）:
   - spec のフォルダに `spec.md`・`plan.md`・`tasks.md` がそろい、ブランチにコミット済みであること
   - spec.md の要件表で、取り下げ以外の要件のステータスがすべて「確定」であること（「案」が残っていれば承認前とみなす）
   - `[NEEDS CLARIFICATION` が残っていないこと
     どれかを満たさなければ中断し、足りないものをユーザーに報告する（spec の確定は師匠の承認を経てユーザーが行う）
5. ワークスペースを作る: `<メインのワーキングツリー>/.dev-loop/<YYYYMMDD>-issue-<N>-<スラッグ>/`。issue の番号・タイトル・URL・spec のフォルダを `issue.md` に保存する。**worktree 内には置かない** — マージ後の cleanup で worktree ごと消えるため
6. TDD 確認のベースを決めて `issue.md` に書く: `git merge-base main HEAD`（積み上げのブランチなら、その親ブランチとの merge-base）

### Step 1: Generator — テスト → 実装

Generator（`generator`）を起動する。promptに含めるもの:

- spec のフォルダの絶対パス（spec.md・plan.md・tasks.md）と、ワークスペース・worktree の絶対パス
- 「既存プロダクト rootist への機能追加である」こと
- 「**テストだけのコミットを実装より先に作り、その SHA を `self_evaluation.md` と `handoff.md` に書け**。テストのコミットの後は、テストを足すことはできても、消す・書き換える・skip することはできない（検証の段の TDD 確認で差し戻される）」

完了後、`handoff.md` と `self_evaluation.md` がそろっていることを確認する。無ければ1回だけ再依頼し、それでも無ければ中断して報告する。

### Step 2: 検証（QA に渡す前に落とす）

worktree で、オーケストレーターが独立に実行する（ホストでは実行しない）:

1. `docker compose run --rm tools pnpm check` / `docker compose run --rm tools pnpm lint` / `docker compose run --rm tools pnpm test:unit -- --run`
2. **TDD 確認**: `pnpm -s tdd-check <テストのコミット> --base <Step 0 のベース>`（ホストで実行する入口。テストはコンテナで流れる。dev コンテナは止めておく — 作業ツリーを一時的にテストのコミットへ切り替えるため）。確かめること:
   - テストのコミットより前に実装が変わっていない（spec・テスト以外の変更が無い）
   - テストのコミットがテストのファイルだけを追加・変更している
   - テストのコミットの時点で、追加・変更したテストが失敗する（RED）
   - 最新の時点で、そのテストが通る（GREEN）
   - テストのコミットの後で、そのテストが緩められていない（行の削除・書き換え・ファイルの削除・skip / todo / only 等の追加が無い）
     終了コード 0 で合格。1 なら出力（違反の一覧）を `review_findings_iter<N>.md` に書き、Generator に **SendMessage** で差し戻す。2 は前提の誤り（未コミットの変更、テストのコミットの SHA の誤り等）なので、原因を直して再実行する
3. どれかが失敗したら Generator に **SendMessage** で差し戻し、Step 1 から繰り返す（この差し戻しもイテレーション上限に含める）。テストのコミット自体が誤っていた（spec を読み違えたテストだった）と Generator が報告した場合は、テストを書き換えさせずに中断し、ユーザーに報告する（テストを後から直すと TDD 確認の意味が無くなるため）

### Step 3: QA評価（イテレーションN）

1. **devサーバー起動（オーケストレーターの仕事）**:
   - worktree 内で実行する（`.env` の `COMPOSE_PROJECT_NAME` / `DEV_PORT` がそのまま効く。シェルで環境変数を上書きしない）。`DEV_PORT` は `pnpm -s worktree-env get DEV_PORT` で読む
   - DB は Supabase 開発用クラウドに直結する。共有 DB へのスキーマ変更の適用は main へのマージ時の自動適用だけで、エージェントは共有 DB に書き込まない（規則は CLAUDE.md と .claude/rules/database.md）。共有 DB 上のスキーマに依存する受け入れシナリオは、QA では「未検証（マージ後にユーザーが確認）」として扱う
   - `handoff.md` の起動手順に従う。既定は `docker compose --profile dev up -d --build`（ホストで `pnpm dev` は実行しない）。起動前に `lsof -iTCP:<DEV_PORT> -sTCP:LISTEN -P` が**空であることを確認し、空でなければ中断して報告する**。`curl -s -o /dev/null -w "%{http_code}" http://localhost:<DEV_PORT>/` が200を返すまで待つ
2. QA（`evaluator`）を起動する（2回目以降は **SendMessage**）: 「spec.md の受け入れシナリオを基準に、`handoff.md` の確認方法で http://localhost:<DEV_PORT> を Playwright で確かめ、要件 ID ごとの判定を `qa_report_iter<N>.md` に書け」（`<DEV_PORT>` は実際の数値に置き換える）。spec のフォルダ・ワークスペースの絶対パスを渡す
3. レポートの総合判定（PASS/FAIL）と、要件 ID ごとの判定を読み取る

### Step 4: 判定分岐

- **FAIL**: Generator に **SendMessage** で `qa_report_iter<N>.md` への対応（戦略的判断→修正→自己評価→handoff更新）を依頼 → Step 2 → Step 3 を再実行
- イテレーション上限は **3回**（Step 2 の差し戻し・Step 5 のレビュー差し戻しを含む）。超えたら中断し、最新のQAレポート要約と残課題をユーザーに報告
- **PASS**: Step 5へ

### Step 5: 仕上げ — レビュー・コミット・PR

1. dev コンテナを停止する（`docker compose --profile dev stop`）。issue 環境の Compose プロジェクトは残してよい（マージ後の `cleanup` が worktree 削除前に削除する）
2. **コードレビュー**: Skillツールで `code-review` を `args: "high"`（effort は high 固定）で実行（ブランチの変更差分が対象）
3. **セキュリティレビュー**: Skillツールで `security-review` を実行
4. レビュー指摘の扱い:
   - 正当性バグ・セキュリティ脆弱性（CRITICAL/HIGH相当）→ 指摘をワークスペースの `review_findings_iter<N>.md` に書き出し、Generatorに **SendMessage** で修正依頼 → 修正後に Step 2（TDD 確認を含む）・レビューを再実行
   - 軽微な指摘（スタイル・低リスクの改善提案）→ 修正必須とせず、PR本文に「既知の指摘」として記載
5. **Context7 計測**（最終 QA が PASS し、コミット前に行う。`docs/context7-measurement.md` 参照）:
   1. その issue の使用実績と差し戻し回数を集計する: `pnpm metrics:context7 -- --dir ~/.claude/projects/-Users-katoukouhei-Dev-rootist/ --dev-loop <メインのワーキングツリー>/.dev-loop --issue <issue番号>`
   2. 結果の issue 行を `docs/context7-ledger.md` に追記する。**台帳の行は手で書かず、スクリプトの出力を転記する**（出力の issue 行の末尾に備考列を足し、台帳の `text` コードブロックの末尾に追加する。備考に使用場面ルールの版を書く）。台帳は次の「コミット」項目で同じ PR に含める
   3. PR 本文に「Context7 計測」節を載せる（resolve / query-docs 回数、対象ライブラリ、QA イテレーション数、申告との不一致の有無）
6. Generatorが未コミットの変更を残していればConventional Commitsでコミット（`.dev-loop/` はコミットしない — gitignore済み）
7. push して PR を作る。本文は `pr-writer` の形（`.github/pull_request_template.md`）に従い、**「spec と要件の判定」の表に最終の `qa_report_iter<N>.md` の要件 ID ごとの判定を転記する**（QA で未検証の要件は「未検証」のまま。推測で PASS にしない）。あわせて TDD 確認の結果（テストのコミットの SHA と OK）、レビュー実施結果（code-review / security-review）、`Closes #<issue番号>` を載せる。issue 本文は変更しない
8. ユーザーへ最終報告: PRのURL、イテレーション回数、要件 ID ごとの判定の要約（FAIL・未検証があればその理由）、既知の制限事項
9. `cleanup` スキルを PR番号付き（監視モード）で呼び、マージを見守る。マージされたら自動で後片付けが行われる

## ファイル連携規約（全エージェント共通）

spec・plan・tasks は worktree の `specs/issue-<N>-<スラッグ>/`（コミット対象。ループの中では書き換えない）。ループの成果物はワークスペース `<メインのワーキングツリー>/.dev-loop/<YYYYMMDD>-issue-<N>-<スラッグ>/` に集約する:

```
issue.md              # オーケストレーターが作成（issue・spec のフォルダ・TDD 確認のベース）
self_evaluation.md    # Generator（テストのコミットの SHA、検証コマンドの実行出力、Context7 使用記録節）
handoff.md            # Generator → QA への引き渡し（起動手順・要件 ID ごとの確認方法）
qa_report_iter<N>.md  # QA評価レポート（イテレーション毎。要件 ID ごとの PASS / FAIL）
decision_iter<N>.md   # Generator の戦略的判断（維持/ピボット）
review_findings_iter<N>.md  # TDD 確認・code-review / security-review の要修正指摘（オーケストレーターが作成）
```

各エージェントへのpromptには必ず「spec のフォルダの絶対パス」「ワークスペースの絶対パス」「実装先（worktree）の絶対パス」「読むべきファイル」「書くべきファイル名」を明示すること。

## 中断・失敗時の原則

- どのステップでも、同じ失敗が2回続いたらループを止めてユーザーに状況を報告する（無限ループ禁止）
- spec と実装の食い違い（spec の要件が実装できない・矛盾している）が分かったら、spec を書き換えずに中断し、ユーザーに報告する（spec の変更は師匠の承認を経る）
- 中断時もdevサーバーの後始末を忘れない。自 issue の dev コンテナは `docker compose --profile dev stop` で止める。Compose プロジェクト（`rootist-issue-<N>`）は再開に備えて残し、`docker compose down` はしない（マージ後の `cleanup` が削除する）。**他プロジェクト（メインの `rootist` や他 issue）のコンテナには一切触れない**
- エージェントの応答はそのまま転記せず、要点（成果物パス・判定・次のアクション）に絞ってユーザーに報告する
