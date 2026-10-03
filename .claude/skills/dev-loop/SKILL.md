---
name: dev-loop
description: GitHub issueの要望を元に Planner → Generator → QA の3エージェントで開発を自動化するループを実行する。ユーザーが「/dev-loop」またはissueからの自動開発を明示的に依頼したときのみ使用。
argument-hint: <issue番号 または 要望テキスト>
disable-model-invocation: false
---

# dev-loop — issue駆動 3エージェント自動開発ループ

GitHub issueの要望を元に、Planner → Generator → QA の3エージェントを起動して開発を自動化するオーケストレーションスキル。あなた（メインセッション）はオーケストレーターとして振る舞い、自分ではコードを書かない。エージェントの起動・ファイル連携の仲介・devサーバー管理・git/PR操作だけを行う。

## 使い方

```
/dev-loop <issue番号>
/dev-loop <要望テキスト>   # issue番号の代わりに直接要望を渡すことも可
```

`$ARGUMENTS` が数値ならissue番号、それ以外なら要望テキストとして扱う。引数が無ければ `gh issue list --state open` を表示してユーザーに選ばせる。

## 登場エージェント（Agentツールの subagent_type）

| 役割      | subagent_type | 成果物                                                               |
| --------- | ------------- | -------------------------------------------------------------------- |
| Planner   | `planner`     | `spec.md`                                                            |
| Generator | `generator`   | `sprint_contract.md`, 実装コード, `self_evaluation.md`, `handoff.md` |
| QA        | `evaluator`   | `contract_review.md`, `qa_report_iterN.md`                           |

**重要な制約**: QAはBashを持たない。devサーバーの起動・停止は必ずオーケストレーターが行うこと。エージェント間の連携はすべてワークスペース内のファイル経由で行われる。各エージェントは `run_in_background: false` で同期実行し、2回目以降の呼び出しは新規spawnではなく **SendMessage** で同じエージェントに継続依頼する（コンテキスト維持のため）。

## ワークフロー

以下のチェックリストを応答にコピーし、進捗に合わせてチェックする:

```
dev-loop 進捗:
- [ ] Step 0: 前提確認・worktree作成
- [ ] Step 1: Planner — spec.md
- [ ] Step 2: Sprint Contract 合意
- [ ] Step 3: Generator — 実装・裏取り
- [ ] Step 4: QA評価（イテレーションN）
- [ ] Step 5: 判定（PASSまで Step 3〜4 を反復）
- [ ] Step 6: レビュー・コミット・PR・マージ監視
```

用語: **メインのワーキングツリー** はリポジトリ本体のチェックアウト、**worktree** は開発用に `.claude/worktrees/<スラッグ>` へ作る作業ディレクトリを指す（CLAUDE.md の方針により、実装は必ず worktree で行う）。

### Step 0: 前提確認・worktree作成

1. メインのワーキングツリーで `git status` — dirtyなら中断してユーザーに報告（自動stash禁止）
2. issue番号指定の場合: `gh issue view <n> --json number,title,body,labels` で内容取得。取得失敗なら中断
3. ワークスペース作成: `<メインのワーキングツリー>/.dev-loop/<YYYYMMDD>-<機能スラッグ>/`（スラッグはissueタイトルから英語kebab-caseで生成）。issue内容を `issue.md` に保存（番号・タイトル・本文・URL）。**worktree 内には置かない** — マージ後の cleanup で worktree ごと消えるため
4. worktree作成:
   1. `git -C <メインのワーキングツリー> pull --ff-only` で main を最新化
   2. `git worktree add -b <ブランチ> .claude/worktrees/<スラッグ> main`（ブランチ名は `feat/issue-<n>-<スラッグ>`、テキスト入力の場合は `feat/<スラッグ>`）
   3. EnterWorktree（`path` 指定）でセッションを worktree に移す
   4. `cp <メインのワーキングツリー>/.env .env` と `pnpm install` — gitignore 対象の `.env` と `node_modules/` は worktree に無いため
   5. **issue 番号指定の場合のみ**、コピーした `.env` に issue 単位の Docker 環境用 5 キーを設定する（規則・理由は CLAUDE.md「Docker 開発環境（issue 単位の分離）」）。既存キーは置き換え、未定義キーは追加し、各キーがちょうど 1 回だけ現れる状態にする。**値はクォートしない**（`KEY=value` 形式。メインの `DATABASE_URL="..."` のクォートも外す）。メインの `.env` は変更しない:

      | キー                   | 値                                                                                         |
      | ---------------------- | ------------------------------------------------------------------------------------------ |
      | `COMPOSE_PROJECT_NAME` | `rootist-issue-<N>`                                                                        |
      | `DEV_PORT`             | `20000+N`                                                                                  |
      | `MYSQL_PORT`           | `30000+N`                                                                                  |
      | `DATABASE_URL`         | メインの値のホスト部を `localhost:<MYSQL_PORT>` に置換（ユーザー・パスワード・DB名は同じ） |
      | `BETTER_AUTH_URL`      | `http://localhost:<DEV_PORT>`                                                              |

      テキスト入力モード（issue 番号なし）では設定しない。その場合はディレクトリ名由来のプロジェクト名＋既定ポート（5173 / 3306）になり、メインの環境と同時には起動できない（起動に失敗するだけで他の環境は止まらない）。N が 10000 以上の場合は対象外のため中断してユーザーに報告する。

### Step 1: Planner — 仕様策定

Planner（`planner`）を起動。promptに含めるもの:

- `issue.md` のパスと要点（issue本文をそのまま貼る）
- ワークスペースのパス（spec.mdの出力先）
- 「既存プロダクトrootistへの機能追加である」こと

完了後、spec.mdの存在を確認。無ければ1回だけ再依頼、それでも無ければ中断してユーザーに報告。

### Step 2: Sprint Contract 交渉（Generator ⇄ QA）

1. Generator（`generator`）を起動。promptで指示: 「spec.mdを読み、`sprint_contract.md` を作成した時点で一旦停止して報告せよ。実装はまだ始めるな」
2. QA（`evaluator`）を起動。promptで指示: 「`sprint_contract.md` を審査し、結果を `contract_review.md` に書け（承認 or 差し戻し＋修正案）」
3. 差し戻しの場合: Generatorに **SendMessage** で `contract_review.md` を読んで契約を修正するよう依頼 → QAに **SendMessage** で再審査依頼
4. 交渉は最大3往復。合意に至らなければ中断し、争点をユーザーに報告して判断を仰ぐ

### Step 3: Generator — 実装

合意後、Generatorに **SendMessage**: 「契約が承認された。実装フェーズ（フェーズ3〜5）を実行し、`self_evaluation.md` と `handoff.md` を作成せよ」

完了後、オーケストレーターが検証コマンドを独立に再実行して裏取りする: `pnpm check` と `pnpm lint`。失敗したらGeneratorに **SendMessage** で差し戻す（QAに渡す前に落とす）。

### Step 4: QA評価（イテレーションN）

1. **devサーバー起動（オーケストレーターの仕事）**:
   - worktree 内で実行する（`.env` の `COMPOSE_PROJECT_NAME` / `DEV_PORT` / `MYSQL_PORT` がそのまま効く。シェルで環境変数を上書きしない）。`DEV_PORT` は `sed -n 's/^DEV_PORT=//p' .env | tail -n1` で読む（issue 番号なし＝未設定なら 5173）
   - DB が必要なら、**MySQL サービスだけ**を起動する: `docker compose up -d mysql`（`--profile dev` で dev コンテナは起動しない。ホストの `pnpm dev` とポートを取り合い、QA 対象のコードが曖昧になるため）。**起動に失敗したら（ポート衝突など）先へ進まず、中断してユーザーに報告する**（issue 番号なしの worktree でメインの MySQL が 3306 を使っている場合など）。成功したら `docker compose ps` で `rootist-issue-<N>-mysql-1` と `0.0.0.0:<MYSQL_PORT>->3306/tcp` を確認する
   - 初回（MySQL が空）は `pnpm db:push --force` でスキーマを反映する（Bash は非対話のため、drizzle-kit の確認プロンプトを `--force` で自動承認する）。`--force` はデータを失う変更も無確認で適用するため、**次の 3 条件がすべて成り立つときだけ**実行する。1 つでも欠けたら `db:push` を自動実行せず、ユーザーに確認する（メインの DB を書き換えないため）。(1) `.env` の `COMPOSE_PROJECT_NAME` が `rootist-issue-<数字>` に完全一致、(2) `.env` の `DATABASE_URL` が `@localhost:<MYSQL_PORT>/` を含む、(3) `mysql` サービスが healthy（起動直後は healthy になるまで待つ）。判定と実行（クォートは除いて判定する）:

     ```bash
     name=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env | tail -n1 | tr -d "\"'")
     port=$(sed -n 's/^MYSQL_PORT=//p' .env | tail -n1 | tr -d "\"'")
     printf '%s\n' "$name" | grep -qxE 'rootist-issue-[0-9]+' \
       && [ -n "$port" ] \
       && sed -n 's/^DATABASE_URL=//p' .env | tail -n1 | tr -d "\"'" | grep -qF "@localhost:${port}/" \
       && [ "$(docker compose ps mysql --format '{{.Health}}')" = healthy ] \
       && pnpm db:push --force
     ```

   - `pnpm dev --port <DEV_PORT> --strictPort` を `run_in_background: true` で起動する。起動前に `lsof -iTCP:<DEV_PORT> -sTCP:LISTEN -P` が**空であることを確認し、空でなければ中断して報告する**。`--strictPort` は別ポートへのずれを防ぐが、ワイルドカードアドレス（Docker の公開ポート等）で LISTEN しているプロセスとの衝突は検知しないことがある（macOS で確認）ため、事前の空き確認が必要。`curl -s -o /dev/null -w "%{http_code}" http://localhost:<DEV_PORT>/` が200を返すまで待つ
2. QAに **SendMessage**: 「`handoff.md` を読み、http://localhost:<DEV_PORT> でPlaywright動的テストを実施し、評価レポートを `qa_report_iter<N>.md` に書け」（`<DEV_PORT>` は実際の数値に置き換えて URL を明記する。issue 番号なしの場合は 5173）
3. レポートの総合判定（PASS/FAIL）を読み取る

### Step 5: 判定分岐

- **FAIL**: Generatorに **SendMessage** で `qa_report_iter<N>.md` への対応（戦略的判断→修正→自己評価→handoff更新）を依頼 → Step 3の裏取り → Step 4を再実行
- イテレーション上限は **3回**。超えたら中断し、最新のQAレポート要約と残課題をユーザーに報告
- **PASS**: Step 6へ

### Step 6: 仕上げ — レビュー・コミット・PR

1. devサーバーを停止（バックグラウンドタスクをkill）。issue 環境の Compose プロジェクトは残してよい（マージ後の `cleanup` が worktree 削除前に削除する）
2. `pnpm test:unit -- --run` を実行。失敗したらStep 5のFAIL扱いでGeneratorに差し戻し
3. **コードレビュー**: Skillツールで `code-review` を実行（ブランチの変更差分が対象。QAの静的レビューはSOLID/規約準拠が中心なので、バグハントはここで補完する）
4. **セキュリティレビュー**: Skillツールで `security-review` を実行
5. レビュー指摘の扱い:
   - 正当性バグ・セキュリティ脆弱性（CRITICAL/HIGH相当）→ 指摘をワークスペースの `review_findings_iter<N>.md` に書き出し、Generatorに **SendMessage** で修正依頼 → 修正後にStep 3の裏取り・ユニットテスト・レビューを再実行（この差し戻しもイテレーション上限3回に含める）
   - 軽微な指摘（スタイル・低リスクの改善提案）→ 修正必須とせず、PR本文に「既知の指摘」として記載
6. Generatorが未コミットの変更を残していればConventional Commitsでコミット（`.dev-loop/` はコミットしない — gitignore済み）
7. push して PR作成:
   - タイトル: `feat: <issueタイトル>` 等のConventional Commits形式
   - 本文: 実装概要、QA評価結果の要約、レビュー実施結果（code-review / security-review）、`Closes #<issue番号>`（issue起点の場合）
8. ユーザーへ最終報告: PRのURL、イテレーション回数、QA判定サマリ、既知の制限事項
9. `cleanup` スキルを PR番号付き（監視モード）で呼び、マージを見守る。マージされたら自動で後片付けが行われる

## ファイル連携規約（全エージェント共通）

ワークスペース `<メインのワーキングツリー>/.dev-loop/<YYYYMMDD>-<スラッグ>/` に集約:

```
issue.md              # オーケストレーターが作成（発端のissue）
spec.md               # Planner
sprint_contract.md    # Generator提案 → 合意版に更新
contract_review.md    # QA（契約審査）
self_evaluation.md    # Generator（検証コマンドの実行出力を貼付）
handoff.md            # Generator → QA への引き渡し
qa_report_iter<N>.md  # QA評価レポート（イテレーション毎）
decision_iter<N>.md   # Generator の戦略的判断（維持/ピボット）
review_findings_iter<N>.md  # code-review / security-review の要修正指摘（オーケストレーターが作成）
```

各エージェントへのpromptには必ず「ワークスペースの絶対パス」「実装先（worktree）の絶対パス」「読むべきファイル」「書くべきファイル名」を明示すること。

## 中断・失敗時の原則

- どのステップでも、同じ失敗が2回続いたらループを止めてユーザーに状況を報告する（無限ループ禁止）
- 中断時もdevサーバーの後始末を忘れない。ホストの dev サーバー（`pnpm dev`）は停止する。自 issue の Compose プロジェクト（`rootist-issue-<N>`）は再開に備えて残し、`docker compose down` はしない（マージ後の `cleanup` が削除する）。**他プロジェクト（メインの `rootist` や他 issue）のコンテナには一切触れない**
- エージェントの応答はそのまま転記せず、要点（成果物パス・判定・次のアクション）に絞ってユーザーに報告する
