---
paths:
  - 'compose.yaml'
  - 'Dockerfile*'
  - '.dockerignore'
  - '.env*'
---

# Docker 開発環境（issue 単位の分離）

git worktree 1つ = issue 1つ = Compose プロジェクト 1つとして扱い、コンテナ名・ネットワーク・ボリューム・ホストポートを issue ごとに分離する。複数 issue を同時に起動してもポートは衝突せず、`docker ps` のコンテナ名から issue が分かる。worktree の `.env` に設定する 2 キーは CLAUDE.md の git戦略を参照。

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

- その worktree の設定値: worktree の `.env` の `COMPOSE_PROJECT_NAME` / `DEV_PORT`
- 起動中の実ポート（worktree 内で）: `docker compose ps`
- 全 issue 環境の一覧: `docker compose ls`、`docker ps --filter name=rootist-issue-`
- dev-loop のオーケストレーターは worktree の `.env` から `DEV_PORT` を読み、QA への依頼文に `http://localhost:<DEV_PORT>` を明記する

## 制約・後始末

- issue 番号の無い worktree（dev-loop のテキスト入力モード等）は 2 キーを設定しない。ディレクトリ名由来のプロジェクト名＋既定ポートになり、メインの環境と同時には起動できない（起動に失敗するだけで他の環境は止まらない）
- Google ログインは Google Cloud Console に登録済みのリダイレクト URI（ポート 5173）以外では動かない既知の制約がある。issue 環境（`DEV_PORT` が 5173 以外）では確認できない
- issue 環境の Compose プロジェクト（コンテナ・ネットワーク・ボリューム）は、マージ後に `cleanup` スキルが worktree 削除の前に削除する。メインの `rootist` や他 issue のプロジェクトには触れない
