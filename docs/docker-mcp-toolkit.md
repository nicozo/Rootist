# Docker MCP Toolkit の導入手順

Claude Code から Docker Hub 上のイメージ検索・情報取得などを自然言語で実行できるようにするための、Docker MCP Toolkit（gateway）のセットアップ手順です。

## 1. これは何か / 何ができるようになるか / 現時点でできないこと

Docker MCP Toolkit（`docker mcp gateway`）は、複数の MCP（Model Context Protocol）サーバーを1つの gateway プロセスにまとめ、Claude Code などの MCP クライアントに公開する仕組みです。MCP サーバーはホストに直接インストールされるのではなく、それぞれ専用の Docker コンテナ内で隔離実行されます（起動には `docker run --rm -i --init --security-opt no-new-privileges ...` のようなサンドボックス設定が使われます）。そのため、新しい MCP サーバーを使うたびにホストへ Node.js / Python 等の実行環境を個別に構築する必要がありません。

rootist リポジトリでは、`rootist` という名前の Docker MCP プロファイルに **`dockerhub`（Docker Hub 公式 MCP サーバー）** を1件だけ登録しています。これにより、Claude Code から「このイメージの最新タグを調べて」「このリポジトリの情報を取得して」といった Docker Hub 上のレジストリ操作を自然言語で依頼できるようになります。

### 現時点でできないこと

- 有効化している Docker 関連サーバーは `dockerhub`（Docker Hub のレジストリ API：イメージ検索・リポジトリ情報取得・タグ確認等）のみです。
- **ローカルの Docker デーモン上で動いているコンテナ／イメージの確認・管理（`docker ps` / `docker images` 相当の操作）は、Docker 公式 MCP カタログ（`mcp/docker-mcp-catalog`、314 サーバー・2026-09-02 時点）にその役割を担うサーバーが存在しないため、MCP 経由では現状提供されていません。** カタログを全件走査した結果、サーバー名・イメージ名に `docker` を含むのは `dockerhub`（Docker Hub 連携）と `docker-docs`（公式ドキュメント検索のみ）の2件だけで、いずれもローカルの Docker デーモンを操作するものではありませんでした。
- **これらの操作は、これまでどおり Claude Code の Bash ツールから `docker ps` / `docker images` / `docker compose` 等のコマンドを直接実行して行ってください。** 本ツールキットの導入によって失われる能力は一つもありません。

## 2. 前提条件

- Docker Desktop がインストール済みで起動していること
- Docker Desktop の MCP Toolkit 機能が有効であること（3章参照）

**動作確認済み環境**（本手順書執筆時点でこの環境で実行して確認した実測値）:

```
$ docker --version
Docker version 29.7.2, build a7dcaa6

$ docker mcp version
v0.43.3
```

`docker mcp` の CLI サブコマンド・フラグはバージョンによって変化します。以降の手順で迷った場合は `docker mcp <サブコマンド> --help` で実際の構文を確認してください（7章参照）。

## 3. セットアップ手順

以下の順序を厳守してください。**プロファイル作成・サーバー追加を「動作確認」より前に行う**のが重要です。順序が逆だと、ツールセットが空の状態で動作確認をしてしまい「壊れている」と誤認します。

### 3-1. Docker Desktop で MCP Toolkit を有効にする

Docker Desktop を起動し、左サイドバー（または「Settings」内）にある **MCP Toolkit** の項目を開きます。機能が無効になっている場合は有効化してください（Docker Desktop のバージョンによりベータ機能の有効化が必要な場合があります）。GUI 操作の詳細画面はバージョンにより変わるため、本手順書ではスクリーンショットではなく操作の要点のみを記載します。

### 3-2. プロファイル `rootist` を作成する

```bash
docker mcp profile create --name rootist --id rootist --server catalog://mcp/docker-mcp-catalog/dockerhub
```

`--id rootist` を明示することで、プロファイル ID が名前から自動生成されるスラグと一致しない事態を避けます（`--id` は `docker mcp profile create --help` の説明どおり「省略時は名前をスラグ化した値がデフォルト」であり、確実性を優先して明示指定しています）。このコマンドはプロファイル作成とサーバー登録を同時に行います。実行すると次のように出力されます。

```
Created profile rootist with 1 servers
```

もし何らかの理由でこのコマンドが失敗する場合は、以下のように2段階に分けて実行することもできます。

```bash
docker mcp profile create --name rootist --id rootist
docker mcp profile server add rootist --server catalog://mcp/docker-mcp-catalog/dockerhub
```

### 3-3. プロファイルに MCP サーバー `dockerhub` を追加する

3-2 のコマンドで `dockerhub` は既に追加済みです。後から別の rootist 用プロファイルにサーバーを追加したい場合は `docker mcp profile server add rootist --server catalog://mcp/docker-mcp-catalog/<サーバー名>` を使います（5章参照）。

### 3-4. （必要な場合のみ）シークレットを登録する

`dockerhub` サーバーは Docker Hub の Personal Access Token（`dockerhub.pat_token` / 環境変数名 `HUB_PAT_TOKEN`）を使うとプライベートリポジトリの操作や書き込み系操作が可能になります。未設定でも `search` や公開リポジトリの参照などは動作します。登録方法は6章を参照してください。

### 3-5. Claude Code でプロジェクトスコープの MCP サーバーを承認する

`.mcp.json` はリポジトリに同梱済みです（プロジェクトルート）。このファイルがあると、Claude Code はプロジェクトを開いたときに `MCP_DOCKER` という名前のプロジェクトスコープ MCP サーバーを検出します。Claude Code を再起動（またはプロジェクトを開き直す）と、承認プロンプトが表示されるので承認してください。承認後は `/mcp` コマンドで `MCP_DOCKER` が接続済みとして表示されます。

## 4. 動作確認

以下の3段階で確認します。

### 4-1. プロファイルの内容確認

```bash
docker mcp profile show rootist
```

**期待される出力の特徴**: `servers:` 配下に要素が1件存在し、`snapshot.server.name: dockerhub` が含まれていること。`servers:` が空（`servers: []` 相当）の場合はプロファイルにサーバーが登録されていません。

### 4-2. ゲートウェイの dry-run

```bash
docker mcp gateway run --profile rootist --dry-run
```

**期待される出力の特徴**: `- Those servers are enabled: dockerhub` の行に続き、`> dockerhub: (13 tools)` のようにツール数が表示され、`> 13 tools listed in ...` という合計行が出ること。その後 `mcp-find` 等の内部管理ツール（9件）が追加表示されますが、これは `dockerhub` とは別枠の常設ツールです。最後に `Dry run mode enabled, not starting the server.` と表示されて終了すれば正常です（`--dry-run` を付けない限り、このコマンドは常駐プロセスとして待受を続けるため、動作確認では必ず `--dry-run` を付けてください）。

参考: `--profile` を付けずに `docker mcp gateway run --dry-run` を実行すると `- No server is enabled` / `> 0 tools listed` となり、カタログ由来のツールが1つも出なくなります（内部管理ツール9件は変わらず表示されます）。これが `.mcp.json` の `args` に `--profile rootist` を必ず含める理由です。

### 4-3. Claude Code 側の接続確認

Claude Code の対話セッションで `/mcp` を実行し、`MCP_DOCKER` が接続済みとして一覧に表示され、`dockerhub` 由来のツールが1件以上見えることを確認してください（この手順は Claude Code 本体の UI を介するため、開発者自身の環境で確認する必要があります）。

## 5. MCP サーバーを追加する

後から別の MCP サーバーをプロファイルに追加したい場合は、ホストに Node.js / Python 等をインストールする必要はありません。以下のコマンドで追加できます。

```bash
docker mcp profile server add rootist --server catalog://mcp/docker-mcp-catalog/<サーバー名>
```

追加したいサーバー名は、Docker 公式 MCP カタログを照会して確認できます。

```bash
docker mcp catalog show mcp/docker-mcp-catalog:latest
```

サーバーを追加した後は、必ず 4-2 の `docker mcp gateway run --profile rootist --dry-run` を再実行し、追加したサーバーのツールが認識されていることを確認してください。

## 6. シークレットの取り扱い

- 認証情報（Docker Hub のトークン、各種 MCP サーバーの API キー等）は **Docker Desktop のシークレットストア**で管理します。CLI からは以下のように登録できます。

  ```bash
  echo <your-token> | docker mcp secret set HUB_PAT_TOKEN
  ```

  （`<your-token>` はプレースホルダです。実際のトークン値に置き換えてから実行してください。登録済みシークレットの一覧は `docker mcp secret ls`、削除は `docker mcp secret rm <name>` で行えます。）

- **`.mcp.json`・`.env`・本手順書・`README.md` を含む、リポジトリにコミットされるいかなるファイルにも、シークレットの実値を書いてはいけません。** シークレットは Docker Desktop 側（OS のキーチェーンおよび Secrets Engine プロバイダ）で一元管理され、リポジトリには一切含まれません。

## 7. トラブルシューティング

- **ツールが1つも見えない** → プロファイルが未作成、または `--profile` に渡している名前が `rootist` と一致していない可能性があります。`docker mcp profile show rootist` を実行し、`servers:` が空でないか確認してください。これは本手順で最も踏みやすい失敗です。
- **`--profile` と `--servers` / `--enable-all-servers` は同時に指定できません（相互排他）**。`docker mcp gateway run --help` にも明記されています。`.mcp.json` の `args` にはこの3者のうち `--profile` のみを含めてください。
- **CLI のサブコマンド名はバージョンによって変わります。** 迷ったら `docker mcp profile --help` のように `--help` を付けて実際のサブコマンド一覧を確認してください。参考として、本手順書執筆時点（`docker mcp version` = `v0.43.3`）の `docker mcp profile` サブコマンドは `config` / `create` / `export` / `import` / `list` / `pull` / `push` / `remove` / `server` / `show` / `tools` であり、**`use` や `select` に相当するサブコマンドは存在しません**。
- **公式ドキュメントと実際の CLI 出力が食い違う場合は、実際の CLI 出力を優先してください。** ドキュメントの更新が CLI のリリースに追いついていない場合があります。
- **「起動中のコンテナを一覧して」と Claude Code に頼んでもMCPツールが使われない** → 不具合ではありません。ローカルの Docker デーモンのコンテナ／イメージ管理を行う公式カタログサーバーが存在しないためです（1章「現時点でできないこと」を参照）。この操作は Bash ツールから `docker ps` / `docker images` を直接実行してください。

## 8. 参考リンク

- [Docker MCP Toolkit（公式ドキュメント）](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
- [Docker MCP Gateway（公式ドキュメント）](https://docs.docker.com/ai/mcp-gateway/)
- [Docker MCP Catalog](https://hub.docker.com/mcp)
