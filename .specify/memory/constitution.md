# Rootist Constitution

<!--
  Spec Kit の各コマンド（/speckit-specify・/speckit-plan・/speckit-analyze など）が読む、このプロジェクトの原則。
  規約の本文は CLAUDE.md と .claude/rules/ が正。ここには写さず、どこを見るかだけを書く。
  規約を変えるときは CLAUDE.md / .claude/rules/ を直し、このファイルは参照先が変わったときだけ直す。
-->

## Core Principles

### I. 規約は CLAUDE.md と .claude/rules/ に従う

コーディング規約・Single Source of Truth・git 戦略・秘密情報の扱い・検証コマンド・アーキテクチャは、リポジトリ直下の `CLAUDE.md` に従う。触るファイルに応じた規約は `.claude/rules/` の該当ファイル（frontmatter の `paths:` で対象が決まる）に従う。spec・plan・tasks の内容がこれらと食い違う場合は、規約側を正として spec 側を直す。

### II. spec は何を・なぜだけを書く

spec.md には利用者から見た振る舞いとその理由を書き、技術・ファイル構成・API は plan.md 以降に書く。書き方（EARS 記法の要件表・要件 ID・ステータス・Given / When / Then の受け入れシナリオ）は `.specify/templates/overrides/spec-template.md` が正。/speckit-clarify などで要件を足す・直すときも、このテンプレートの要件表に行を足す・直す形で行い、表の外に「System MUST」形式の箇条書きを足さない。

### III. 完了の基準は spec の受け入れシナリオ

実装の完了は spec.md の受け入れシナリオを満たすかで判定する。plan.md・tasks.md は spec の要件 ID に結び付け、spec に無い機能を足さない。

### IV. 検証は CLAUDE.md の手順で行う

型チェック・lint・テストは CLAUDE.md の「Commands」に書かれた方法（Docker コンテナ内）で通す。テストの置き場所と役割分担は `.claude/rules/testing.md` に従う。

### V. テストを先に書き、実装は dev-loop で行う

テストは必須で、実装より先に書く（TDD）。tasks.md には、各ユーザーストーリーの実装タスクより前にテストのタスクを置く。実装は `/speckit-implement` ではなく `dev-loop`（`.claude/skills/dev-loop/SKILL.md`）で行う。dev-loop がテストだけのコミットを実装より先に作らせ、`pnpm -s tdd-check` でテストの失敗→成功と、テストが緩められていないことを確かめる。

## Governance

- このファイルと CLAUDE.md / `.claude/rules/` が食い違う場合は CLAUDE.md / `.claude/rules/` を正とし、このファイルを直す
- 原則を足す・変えるときは、規約の本文を CLAUDE.md / `.claude/rules/` に書き、ここには参照だけを足す
- plan.md の Constitution Check では、上の原則 I〜V への適合を確認する

**Version**: 1.1.0 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-20
