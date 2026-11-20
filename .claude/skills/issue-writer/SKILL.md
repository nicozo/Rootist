---
name: issue-writer
description: spec を書き始めるときに、1要望1件の GitHub issue（本文は要望 ID・Notion の要望へのリンク・specs/ のパスだけ）を作り、同じ番号のブランチと worktree を用意して /speckit-specify に渡す。「issueを作って」「この要望の spec を書き始めたい」等と言われた時、または /issue-writer で明示的に呼ぶ。
argument-hint: [要望 ID または Notion の要望 URL（省略可）]
---

# issue-writer

spec を書き始める時点で、作業の単位と窓口になる issue を 1 要望につき 1 件作る。issue は「この要望の作業はこの番号で進める」という目印で、ブランチ名・worktree の環境・PR の `Closes #N`・dev-loop の入力をつなぐ。**なぜ・何を・要件は spec.md に書くので、issue には書かない**（二重に書くと片方だけ更新されて食い違う）。

## 進め方

1. **要望を特定する**
   Notion の要望の **要望 ID** と **ページの URL** をユーザーから受け取る（引数で渡されていればそれを使う）。どちらかが無ければ尋ねる。要望がまだ Notion に無いなら、先に Notion に要望を起こしてもらう（背景の深掘りは要望と spec の仕事で、issue ではしない）。
   既に同じ要望の open な issue があれば（`gh issue list --search "<要望 ID>" --state open`）、新しく作らずその issue を使う。

2. **種別とスラッグを決める**
   CLAUDE.md の git 戦略のとおり、`<type>`（Conventional Commits の種別）と `<スラッグ>`（英小文字・数字・ハイフン）を決める。タイトルは要望の名前を短い日本語で書く。

3. **下書きを見せてから起票する**
   `gh issue create` は GitHub 上に公開される行為。タイトル・種別・スラッグ・本文の下書きを見せ、了承を得てから実行する。

4. **起票して本文に spec のパスを入れる**
   番号は起票するまで分からないので、2 段で行う:
   1. `gh issue create --label enhancement --title "<タイトル>" --body-file <本文>`（spec のパスの行は `specs/issue-<番号>-<スラッグ>/` のまま）で作り、番号 `<N>` を得る
   2. 本文の `<番号>` を `<N>` に置き換え、`gh issue edit <N> --body-file <本文>` で反映する
   3. `gh issue view <N> --json body -q .body` で、spec の行が `specs/issue-<N>-<スラッグ>/` になったことを確かめる（失敗していればやり直す。番号が入っていないと dev-loop が spec を辿れない）

5. **ブランチと worktree を用意する**（spec と実装を同じ issue・同じブランチで進めるため）
   CLAUDE.md の git 戦略の手順で、ブランチ `<type>/issue-<N>-<スラッグ>` の worktree を作り、`pnpm -s worktree-env setup <N>` で `.env` を準備する。

6. **/speckit-specify に渡す**
   worktree の中で `/speckit-specify` を、spec のフォルダを明示して呼ぶ:

   ```
   /speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/issue-<N>-<スラッグ> <要望の説明（Notion の要望の要約）>
   ```

   フォルダを明示しないと Spec Kit は `specs/001-<名前>` のような連番で作り、ブランチ名・issue と対応しなくなる。spec はこのブランチでコミットし、そのまま plan・tasks・実装も同じブランチで進める。

7. 発行した issue の URL・ブランチ名・worktree のパス・spec のフォルダを報告する。

## 本文

`.github/ISSUE_TEMPLATE/feature_request.md` の形（要望 ID・Notion の要望へのリンク・spec のパス）だけで書く。背景・要望の説明・開発要件のチェックボックスは書かない（spec.md に書く）。

## 命名の対応

| もの        | 名前                          |
| ----------- | ----------------------------- |
| issue       | `#<N>`                        |
| ブランチ    | `<type>/issue-<N>-<スラッグ>` |
| worktree    | `.claude/worktrees/issue-<N>` |
| spec の場所 | `specs/issue-<N>-<スラッグ>/` |

ブランチと spec のフォルダは同じ `issue-<N>-<スラッグ>` を使う。`<type>/` はブランチだけに付く（種別が変わっても spec のフォルダ名は変えない）。
