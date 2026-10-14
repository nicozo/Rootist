---
paths:
  - 'compose.yaml'
  - 'Dockerfile*'
  - '.dockerignore'
  - '.env*'
---

# Docker 開発環境（issue 単位の分離）

git worktree 1つ = issue 1つ = Compose プロジェクト 1つとして扱い、コンテナ名・ネットワーク・ボリューム・ホストポートを issue ごとに分離する。複数 issue を同時に起動してもポートは衝突せず、`docker ps` のコンテナ名から issue が分かる。worktree の `.env` の準備と 2 キーの設定は、下の「`.env` の準備と 2 キーの設定」が正。

## `.env` の準備と 2 キーの設定

- 作成直後の準備は `pnpm -s worktree-env setup <N>`（`<N>` は issue 番号。テキスト入力モードは省略）。メインの `.env` をコピーし（worktree に既にあれば他のキーに触れない）、N があれば下の 2 キーを設定する。エージェントは `.env` を直接読めないため、確認・コピー・設定はこのコマンドで行う（範囲と理由は `.claude/rules/agent-env-access.md`。使い方は `pnpm -s worktree-env --help`）
- 設定する 2 キーと値（コマンドの実装 `src/lib/dev-tools/worktree-env.ts` はこの表が出典）:

  | キー                   | 値                  |
  | ---------------------- | ------------------- |
  | `COMPOSE_PROJECT_NAME` | `rootist-issue-<N>` |
  | `DEV_PORT`             | `20000 + N`         |

- 値はクォートしない（`KEY=value` 形式）。各キーはちょうど 1 回。`DATABASE_URL` は書き換えない（全 worktree でメインと同じ Supabase の値を使う）。メインの `.env` は変更しない
- 対象は `git worktree list` に登録されたメイン以外の worktree だけ。N が 1〜9999 の整数でない場合（10000 以上は対象外）やメインに `.env` が無い場合は失敗し、何も書かない

## 命名規則

| 起動のしかた                                   | Compose プロジェクト名 | コンテナ名                |
| ---------------------------------------------- | ---------------------- | ------------------------- |
| issue 用 worktree（issue 番号 N）              | `rootist-issue-<N>`    | `rootist-issue-<N>-dev-1` |
| 従来起動（メインのワーキングツリー、番号なし） | `rootist`              | `rootist-dev-1`           |

- プロジェクト名は `.env` の `COMPOSE_PROJECT_NAME` で決まる（Compose 標準）。`compose.yaml` に `name:` / `container_name` は書かない。固定するとメインの環境と同名になり壊すため

## ポート割当

| 用途                        | 従来起動 | issue N の環境 | 例: issue #112 |
| --------------------------- | -------- | -------------- | -------------- |
| アプリ（dev）のホストポート | 5173     | `20000 + N`    | 20112          |

- `compose.yaml` は `DEV_PORT` があればそれを、無ければ（未定義・空文字とも）5173 を使う。コンテナ内部のポートは変わらない
- `DEV_PORT` は、dev コンテナで動かす場合もホストの `pnpm dev` で動かす場合も、その issue のアプリ用ポートとして共通で使う（同時には使わない）
- issue 番号 10000 以上は対象外（到達時に方式を見直す）

## ポートの確認方法

- その worktree の設定値: `pnpm -s worktree-env get COMPOSE_PROJECT_NAME` / `pnpm -s worktree-env get DEV_PORT`（値だけを出す。キー無しは終了コード 3）
- 起動中の実ポート（worktree 内で）: `docker compose ps`
- 全 issue 環境の一覧: `docker compose ls`、`docker ps --filter name=rootist-issue-`
- dev-loop のオーケストレーターは `pnpm -s worktree-env get DEV_PORT` で `DEV_PORT` を取得し、QA への依頼文に `http://localhost:<DEV_PORT>` を明記する

## 制約・後始末

- issue 番号の無い worktree（dev-loop のテキスト入力モード等）は 2 キーを設定しない。ディレクトリ名由来のプロジェクト名＋既定ポートになり、メインの環境と同時には起動できない（起動に失敗するだけで他の環境は止まらない）
- Google ログインは Google Cloud Console に登録済みのリダイレクト URI（ポート 5173）以外では動かない既知の制約がある。issue 環境（`DEV_PORT` が 5173 以外）では確認できない
- issue 環境の Compose プロジェクト（コンテナ・ネットワーク・ボリューム）は、マージ後に `cleanup` スキルが worktree 削除の前に削除する。メインの `rootist` や他 issue のプロジェクトには触れない
