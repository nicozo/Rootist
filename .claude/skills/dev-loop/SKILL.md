---
name: dev-loop
description: Notion の要望の着手判断から、issue 作成・spec（Spec Kit）・Generator → QA による実装・PR・マージ後の後片付けまでを、師匠の承認点（着手判断・spec 確定・PR マージ）で止まりながら進める。今どの段かを Notion・issue・spec・PR から判定して続きから再開する。ユーザーが「/dev-loop」または要望・issue からの自動開発を明示的に依頼したときのみ使用。
argument-hint: <要望 ID（RT-REQ-番号）または issue番号>
disable-model-invocation: false
---

# dev-loop — 着手判断から PR マージまでを進めるハーネス

開発フローのうち、Notion の要望の着手判断から PR のマージ後の後片付けまでを、段（下の「段の判定と進め方」）ごとに進める。師匠の承認点では止まって何をしてほしいかを伝え、承認の後に同じコマンドで呼ばれたら続きから進める。中心の段 6（実装）では、承認済みの spec を入力に、Generator（実装）→ QA（判定）の2エージェントで開発を進める。あなた（メインセッション）はオーケストレーターとして振る舞い、自分ではコードを書かない。エージェントの起動・ファイル連携の仲介・検証コマンドと TDD 確認の実行・devサーバー管理・git/PR操作だけを行う。

**何を作るかは spec.md、どう作るかは plan.md と tasks.md が正**。ループの中で仕様や受け入れ基準を作り直さない（spec と二重になり、完了の基準が二つに分かれるため）。全機能に共通の品質ルール（svelte-autofixer、Context7 の使用場面、テストの置き場所など）は CLAUDE.md と `.claude/rules/` が正で、spec ごとの合意事項にはしない。

## 使い方

```
/dev-loop <要望 ID（RT-REQ-番号）または issue番号>
```

引数が無ければ、Notion の要望 DB で ステータスが 受付〜実装中 の要望と `gh issue list --state open` を表示してユーザーに選ばせる。Notion に要望の無いテキストは受け付けない（先に Notion の要望 DB に要望を起こしてもらう）。

## 段の判定と進め方

**進捗は別のファイルに持たない**。呼ばれるたびに、元データ（Notion の要望のステータス・issue・spec の要件のステータス・PR の状態）から今の段を判定し、その段から進める（同じことを二か所に持つと食い違うため。承認の記録もこれらに残るので、別のセッションで呼ばれても同じ判定になる）。

### 元データの場所

- Notion の要望 DB「📮 要望」: https://app.notion.com/p/420e07f1f4f681218c78f3d6bc6e8838 。使うプロパティは `要望ID`（`RT-REQ-<番号>`）・`ステータス`（受付 / 着手判断 / spec 作成中 / spec 確定 / 実装中 / リリース済み / 見送り）・`GitHub issue`（issue の URL）・`spec`（specs/ のパス）。Notion へは Notion の MCP で読み書きする。使えないセッションでは、Notion の更新が要る場面で止まらず、「Notion の RT-REQ-<番号> を <ステータス> にしてほしい」とユーザーに頼んで先へ進む（ステータスの読み取りが要る段 1 だけは、ユーザーに今のステータスを尋ねる）
- issue: 要望から探すときは、Notion の `GitHub issue` を先に見て、空のときだけ `gh issue list --search "<要望 ID>" --state all` で探す（検索は作った直後の issue を拾えないことがあるため）。issue 番号から要望を辿るときは本文の `要望 ID:` 行
- spec: issue 本文の `spec:` 行のフォルダ。ブランチは `git branch -r --list "origin/*/issue-<N>-*"` で探し、worktree（`.claude/worktrees/issue-<N>`）があればその中の spec を読む
- PR: `gh pr list --search "Closes #<N>" --state all --json number,state,url,headRefName` で issue から探す（マージ後はリモートのブランチが消えることがあるので、ブランチからは探さない）。ブランチを探す前は `git fetch --prune` する

### 段（上から順に当てはめ、最初に当たった段から進める）

まず PR の状態を見る（Notion の更新がユーザー頼みで遅れていても、進んだ段を取り違えないため）。ブランチの PR が merged なら段 8、open なら段 7。closed（未マージ）の PR しか無ければ、作り直すか見送るかをユーザーに尋ねて止まる。PR が無いときだけ、Notion のステータスと issue・spec から段 1〜6 を当てはめる。

| 段            | 当たる条件                                                                  | すること                                                                                                                                                                                                                                                                                                                                                                     | 承認                                                       | 段の後の Notion ステータス          |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| 1. 着手判断   | ステータスが 受付 / 着手判断                                                | 要望の要約を示し、着手か見送りかを師匠に尋ねて**止まる**                                                                                                                                                                                                                                                                                                                     | **師匠**                                                   | 着手 → spec 作成中、見送り → 見送り |
| 2. issue 作成 | 着手済み（spec 作成中〜実装中）で、要望の issue が（open・closed とも）無い | `issue-writer` を dev-loop から呼ぶ（下書きの了承は挟まない）。Notion の `GitHub issue`・`spec` を埋める                                                                                                                                                                                                                                                                     | 自動                                                       | spec 作成中                         |
| 3. 要件定義   | spec.md が無い、または `[NEEDS CLARIFICATION` が残る                        | Planner に spec.md が無ければ specify から、あれば clarify から任せる（下の「Planner の呼び方」）。clarify の質問は師匠に取り次ぐ                                                                                                                                                                                                                                            | 自動（質問だけ師匠）                                       | spec 作成中                         |
| 4. 設計       | plan.md か tasks.md が無い                                                  | Planner に plan から任せる（plan → tasks → analyze → 整形 → コミット）。Planner の報告を確かめて push する                                                                                                                                                                                                                                                                   | 自動                                                       | spec 作成中                         |
| 5. spec 確定  | 要件表に「案」が残る                                                        | spec の要点（要件 ID と一行の要約、受け入れシナリオの数、未決が無いこと）と spec のパスを示し、確定してよいかを師匠に尋ねて**止まる**。承認されたら、取り下げ以外の要件のステータスを「確定」にしてコミット・push                                                                                                                                                            | **師匠**                                                   | spec 確定                           |
| 6. 実装       | 要件がすべて確定で、ブランチの PR が無い                                    | [implement.md](implement.md) の Step 0〜5。PR は `pr-writer` を dev-loop から呼んで作る（了承は挟まない。auto-merge はしない）                                                                                                                                                                                                                                               | 自動                                                       | 実装中（Step 0 で）                 |
| 7. PR マージ  | ブランチの PR が open                                                       | PR の URL・要件 ID ごとの判定・既知の指摘を示し、師匠に PR を見てマージしてもらうよう伝えて**止まる**。`cleanup` の監視モードでマージを見守り、マージされたらそのまま段 8 へ進む。PR に変更を求めるレビューが付いていたら、その指摘を `review_findings_iter<N>.md` に書き、段 6 の Step 1 から（Generator に SendMessage か、新しいセッションなら Generator を起動して）直す | **師匠**（マージは師匠が行う。エージェントはマージしない） | —                                   |
| 8. 後片付け   | ブランチの PR が merged                                                     | `cleanup`（即時モード。監視で拾えていれば済んでいる）。issue は `Closes #N` で閉じている                                                                                                                                                                                                                                                                                     | 自動                                                       | リリース済み                        |

- ステータスが 見送り なら、open な issue があれば理由を書いて閉じ（`state_reason: not_planned`）、終える。リリース済み なら何もしない
- **段を飛ばさない**。ユーザーが段を飛ばす指示（spec 未確定のまま実装へ、など）をしても受け付けず、どの承認が足りないかを伝える
- 承認点（段 1・5・7）で止まるときは、師匠にしてほしいこと（何を見て、何を答えるか）と、承認の後に `/dev-loop <要望 ID または issue番号>` で続きから進むことを伝える。同じセッションで師匠が承認を答えたら、そのまま次の段へ進む
- 段 1〜5 は Docker を使わないので、クラウドのセッションでも進められる。段 6 は Docker が要る（Step 0 で確かめる）
- Notion のステータスが PR の状態とずれている（例: merged なのに 実装中）ときは、PR に合わせて Notion を直す

### Planner の呼び方（段 3〜4）

spec・plan・tasks づくりは Planner（`planner` エージェント）に任せ、オーケストレーターは取り次ぎと外への操作（push・Notion・師匠への質問）だけを行う（spec づくりでオーケストレーターの文脈を埋めないため。下請けは師匠に直接聞けず、許可の確認が要る操作は下請けからだと止まるため）。

1. 下の「ワークスペース」を用意し、EnterWorktree（`path` に `.claude/worktrees/issue-<N>`）でセッションを worktree に移す（無ければ [implement.md](implement.md) の Step 0 の 4 と同じ手順で作る）
2. Planner を起動する（`run_in_background: false`）。prompt に worktree・spec のフォルダ・ワークスペースの絶対パス、要望の説明（Notion の要望の要約）、どこから始めるか（spec.md が無ければ specify、`[NEEDS CLARIFICATION` が残れば clarify、plan.md か tasks.md が無ければ plan）を書く
3. Planner が質問で止まったら、まずコミットを push する（質問は spec.md の `[NEEDS CLARIFICATION` の印として残るので、セッションが切れても段 3 から再開できる）。`planner_questions.md`（未回答の質問だけが書かれている）を師匠に取り次ぎ（推奨と選択肢をそのまま見せる）、答えを **SendMessage** で同じ Planner に返して続けさせる。セッションをまたいだときは、spec.md の印から質問を取り次ぎ、新しい Planner を「clarify から」で起動して答えを prompt に入れる
4. Planner が終わったら `planner_report.md` を読み、spec のフォルダのコミットがあることを確かめて push する。Planner が spec のフォルダ以外を変えていたら push せずに止めて報告する
5. 段 5 へ進む（要約は `planner_report.md` から作る）

### ワークスペース

ループの成果物（Planner の質問・報告、段 6 の報告類）は `<メインのワーキングツリー>/.dev-loop/<YYYYMMDD>-issue-<N>-<スラッグ>/` に置く（worktree 内には置かない。マージ後の cleanup で worktree ごと消えるため）。既にあるかは `.dev-loop/*-issue-<N>-*` で探し、あればそれを使う（日付は作った日なので、日をまたいでも作り直さない）。無ければ作り、issue の番号・タイトル・URL・spec のフォルダを `issue.md` に書く。

### spec の整形（段 4 の最後・段 6 の Step 0）

spec の md は lint（`vp fmt --check`）の対象。Spec Kit が書いたままだと整形の違いで CI の lint が落ちるので、コミットの前に spec のフォルダだけを整形する（段 4 では Planner が行う）: `docker compose run --rm tools pnpm exec vp fmt specs/issue-<N>-<スラッグ>/`。Docker が無いセッションでは整形をとばしてコミットし、段 6 の Step 0 でもう一度整形する（整形で変わったら `docs: spec を整形` でコミットする）。

## 段 6: 実装

手順は [implement.md](implement.md)（Generator → 検証 → QA → レビュー → PR。Docker が要る）。段 6 に入ったら読む。
