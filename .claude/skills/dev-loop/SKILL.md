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
| 3. 要件定義   | spec.md が無い、または `[NEEDS CLARIFICATION` が残る                        | 段 2 から続くときは `issue-writer` が呼んだ `/speckit-specify` の後から、issue とブランチが既にあるときは dev-loop が worktree で `/speckit-specify SPECIFY_FEATURE_DIRECTORY=<issue の spec: のフォルダ> …` を呼ぶ（issue-writer は呼び直さない）→ `/speckit-clarify`。clarify の質問は師匠に答えてもらう                                                                   | 自動（質問だけ師匠）                                       | spec 作成中                         |
| 4. 設計       | plan.md か tasks.md が無い                                                  | `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze`（指摘は spec・plan・tasks で直す）→ 下の「spec の整形」→ コミット・push                                                                                                                                                                                                                                              | 自動                                                       | spec 作成中                         |
| 5. spec 確定  | 要件表に「案」が残る                                                        | spec の要点（要件 ID と一行の要約、受け入れシナリオの数、未決が無いこと）と spec のパスを示し、確定してよいかを師匠に尋ねて**止まる**。承認されたら、取り下げ以外の要件のステータスを「確定」にしてコミット・push                                                                                                                                                            | **師匠**                                                   | spec 確定                           |
| 6. 実装       | 要件がすべて確定で、ブランチの PR が無い                                    | [implement.md](implement.md) の Step 0〜5。PR は `pr-writer` を dev-loop から呼んで作る（了承は挟まない。auto-merge はしない）                                                                                                                                                                                                                                               | 自動                                                       | 実装中（Step 0 で）                 |
| 7. PR マージ  | ブランチの PR が open                                                       | PR の URL・要件 ID ごとの判定・既知の指摘を示し、師匠に PR を見てマージしてもらうよう伝えて**止まる**。`cleanup` の監視モードでマージを見守り、マージされたらそのまま段 8 へ進む。PR に変更を求めるレビューが付いていたら、その指摘を `review_findings_iter<N>.md` に書き、段 6 の Step 1 から（Generator に SendMessage か、新しいセッションなら Generator を起動して）直す | **師匠**（マージは師匠が行う。エージェントはマージしない） | —                                   |
| 8. 後片付け   | ブランチの PR が merged                                                     | `cleanup`（即時モード。監視で拾えていれば済んでいる）。issue は `Closes #N` で閉じている                                                                                                                                                                                                                                                                                     | 自動                                                       | リリース済み                        |

- ステータスが 見送り なら、open な issue があれば理由を書いて閉じ（`state_reason: not_planned`）、終える。リリース済み なら何もしない
- **段を飛ばさない**。ユーザーが段を飛ばす指示（spec 未確定のまま実装へ、など）をしても受け付けず、どの承認が足りないかを伝える
- 承認点（段 1・5・7）で止まるときは、師匠にしてほしいこと（何を見て、何を答えるか）と、承認の後に `/dev-loop <要望 ID または issue番号>` で続きから進むことを伝える。同じセッションで師匠が承認を答えたら、そのまま次の段へ進む
- 段 1〜5 は Docker を使わないので、クラウドのセッションでも進められる。段 6 は Docker が要る（Step 0 で確かめる）
- Notion のステータスが PR の状態とずれている（例: merged なのに 実装中）ときは、PR に合わせて Notion を直す

### spec の整形（段 4 の最後・段 6 の Step 0）

spec の md は lint（`vp fmt --check`）の対象。Spec Kit が書いたままだと整形の違いで CI の lint が落ちるので、コミットの前に spec のフォルダだけを整形する: `docker compose run --rm tools pnpm exec vp fmt specs/issue-<N>-<スラッグ>/`。Docker が無いセッションでは整形をとばしてコミットし、段 6 の Step 0 でもう一度整形する（整形で変わったら `docs: spec を整形` でコミットする）。

## 段 6: 実装

手順は [implement.md](implement.md)（Generator → 検証 → QA → レビュー → PR。Docker が要る）。段 6 に入ったら読む。
