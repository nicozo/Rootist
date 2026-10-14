---
paths:
  - '.env*'
  - '.claude/settings*.json'
  - 'scripts/worktree-env.mjs'
  - 'src/lib/dev-tools/worktree-env*'
---

# `.env` の実値をエージェントに読ませない（deny 設定）

エージェント（メインセッションと generator / evaluator / planner 等のサブエージェント）は、実値の入った `.env` を読めない・編集できない。API キーやパスワードが会話ログ・サブエージェントの記録に残る事故（2026-08-26〜09-02、2026-10-06）を防ぐため。環境変数の**名前と形**は `.env.example` で読める。

目的は「典型的な表示操作を止め、うっかりの漏えいを無くす」こと。悪意のある回避まで防ぐ完全な防御ではない（[できないこと](#できないこと限界)）。

## 拒否されたとき

1. 値が要る確認・準備は、値を出さない窓口コマンド `pnpm -s worktree-env`（使い方の正は `pnpm -s worktree-env --help`）を使う

   | サブコマンド  | 用途                                                                                                                |
   | ------------- | ------------------------------------------------------------------------------------------------------------------- |
   | `setup [<N>]` | worktree 作成直後の `.env` の準備（メインからのコピー＋ issue 番号 N なら 2 キーの設定。規則は docker-worktree.md） |
   | `get <KEY>`   | `COMPOSE_PROJECT_NAME` / `DEV_PORT` の値だけを取得                                                                  |
   | `compare`     | メインとの差が「想定内」か「要確認」か（差分は項目名だけ）。cleanup の判定に使う                                    |
   | `audit`       | `.env.example` の各キーの設定状況（設定あり / 空 / 無し）と余分なキーの名前                                         |

2. それでも足りなければ、人間に依頼する（人間の対処は[下記](#人間側の対処)）
3. **拒否を回避しない**。`sh -c`・絶対パスのプログラム名・`node -e` / `python -c`・別名へのコピー・シンボリックリンク・環境変数経由の指定などは、deny を迂回するための手段として使わない。回避は設定の目的に反し、記録に実値が残る

## 範囲

- 設定の正（パターンの一覧）は `.claude/settings.json` の `permissions.deny`。ここには写さない
- 対象ファイル: `.env`・`.env.local`・`.env.development`・`.env.production`・`.env.test`・`.env.*.local`。メインのワーキングツリーと全 worktree の両方。加えて、列挙外の名前（`.env.bak` 等）も、起動したディレクトリの配下では拒否する。**`.env.example` は拒否しない**
- 対象操作: ファイル読み取り系ツール（Read。Grep / Glob にも best-effort で及ぶ）、編集系ツール（Edit / Write）、シェルの典型的な表示コマンド（`cat` `head` `grep` `rg` `sed` `awk` `source` など。コマンドの全集合は `.claude/settings.json`）
- 対象セッション: このリポジトリ（メイン・worktree）で起動したセッションと、その配下のサブエージェント。deny は全権限モード（`bypassPermissions` を含む）で効く
- 副作用: このリポジトリで起動したセッションでは、ファイルシステム上のどの `.env` も読めない（他プロジェクトの `.env` を含む）
- アプリ（`pnpm dev`・Vitest・Supabase CLI ラッパー・Docker Compose）が実行時に `.env` を読むことは妨げない。OS のサンドボックスでの読み取り禁止は採用しない（それらが正当に読むため、開発が止まる）

### シェルで通るもの・通らないもの（実測）

- 通る: `cat .env.example`、`test -f .env`、`git status --short --ignored`、`pnpm dev` / `pnpm test:unit` / `pnpm check` / `pnpm lint` / `pnpm db:status`、`docker compose ps`、`env FOO=1 cmd`
- **`cp .env ...` と `ls -la .env` も拒否される**（Claude Code が Read の deny をファイル引数を持つコマンドにも適用するため）。コピーは `pnpm -s worktree-env setup`、存在確認は `test -f .env` か `git status --short --ignored` を使う
- 検索コマンドに `.env` という文字列を含めると拒否されうる。検索式は `[.]env` と書き、パターンはファイルから読ませる（`grep -f <パターンファイル>`）

### 周辺コマンドの判断（deny するもの・しないもの）

| 対象                                                              | 判断       | 理由                                                                                            |
| ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `docker compose config`（`--profile dev config` を含む）          | deny       | `.env` を補間した設定を表示する。使用実績なし。必要なら人間が実行する                           |
| `docker inspect` / `docker (compose) exec * env` / `... printenv` | deny       | コンテナの環境変数を表示する。使用実績なし                                                      |
| `printenv` / 引数なしの `env` / `export -p` / 引数なしの `set`    | deny       | 親シェルが持つ秘密の表示。`env FOO=1 cmd` や `set -e` は通る                                    |
| `source` / `.` での `.env` の読み込み                             | deny       | 読み込み後の `echo $VAR` で漏れるため。`source ./x.sh && echo $SECRET` のような迂回は止まらない |
| `rm` / `mv` での削除・移動                                        | 止めない   | 値は出ない                                                                                      |
| `ps` の `e` オプション（プロセスの環境変数）                      | 止めない   | Claude Code が承認プロンプトにする。deny ではない                                               |
| `docker compose run * env` など                                   | 文書化のみ | 網羅できない                                                                                    |

## できないこと（限界）

1. 自作スクリプトやインタプリタ（`node -e`、`python -c`）、`sh -c`、絶対パスのプログラム名、リダイレクト、コマンド置換、変数を介したパス指定など、パターンに一致しない読み取りは止められない
2. ディレクトリの再帰検索（コマンドに `.env` が現れない。`grep -r pattern .` など）は止められない。**再帰検索は gitignore を尊重する手段（`git grep`、Grep ツール、`rg` の既定）を使う。`grep -r` を使う場合は `.env*` を除外する**
3. アプリ・テスト・Docker が実行時に読んだ値が、失敗メッセージやログに出ることは止められない（2026-10-06 の事故の型。別 issue）
4. `.claude/settings.json` を書き換えれば制限を外せる（エージェントも設定変更を担うため禁止していない）
5. このリポジトリの外で起動したセッション、`.claude/settings.json` に deny を持たない古いブランチの worktree から起動したセッションには効かない
6. 既に会話ログ・サブエージェントの記録に残った秘密は消えない（キーの再発行が必要）
7. 上の「周辺コマンドの判断」で文書化に回したもの（`rm` / `mv`、`ps` の `e`、`docker compose run * env`）
8. シェルのグロブ（`cat .env*`、`cat .e*`）は、`.env.example` と区別できないため Bash の deny では止まらない（実測で通る）
9. 列挙外の名前（`.env.bak` 等）を止めるのは、起動したディレクトリの配下だけ（cwd 相対の規則のため）。worktree で起動したセッションから、メインのワーキングツリー直下の列挙外の名前は止まらない。実値ファイルとして使う名前は列挙済みの 6 種に限る
10. `.env.test` は `.gitignore` の `!.env.test` で除外されないので、gitignore を尊重する検索の保護を受けない。Grep ツールのディレクトリ検索では実測でヒットしなかった（Read の deny が best-effort で及ぶため）が、保証はない。将来ダミー値の `.env.test` をコミットしたくなった場合は別名にする・設定を変える。実値は入れない

## 人間側の対処

- 値の確認・変更が必要なときは、人間が自分の端末で行う。エージェントに値を貼らない（貼ると会話ログに残る）
- エージェントが値を必要とする作業（例: 新しいキーの動作確認）は、人間が値をシェル環境に設定して実行するか、人間が実行して結果だけ伝える。psql 等に `.env` を読み込む手順（`set -a; . ./.env; set +a`）は人間の手順で、エージェントは実行しない（`docs/supabase-setup.md`）
- セッションはメインのワーキングツリー（main の最新）から起動する。古いブランチの worktree から直接起動しない（限界 5）
- PR で `.claude/settings.json` の差分があれば、deny が外れていないかを見る（限界 4）
- 多層防御を望む場合は、ユーザー設定（`~/.claude/settings.json`）にも同様の deny を置ける（任意。エージェントは個人設定を変更しない）
- `.claude/settings.local.json`（gitignore 対象の個人設定）に、過去に許可したコマンド文字列として秘密が残っていないかを見直す（任意）
- 漏えいに気づいたら、該当キーを再発行する（Supabase / Google Cloud Console の場所は `docs/supabase-setup.md`）
