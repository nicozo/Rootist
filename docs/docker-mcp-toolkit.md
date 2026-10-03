# Docker MCP Toolkit の導入手順

Claude Code から Docker Hub 上のイメージ検索・情報取得や、ライブラリの最新ドキュメント参照（Context7）を行えるようにするための、Docker MCP Toolkit（gateway）のセットアップ手順です。

## 1. これは何か / 何ができるようになるか / 現時点でできないこと

Docker MCP Toolkit（`docker mcp gateway`）は、複数の MCP（Model Context Protocol）サーバーを1つの gateway プロセスにまとめ、Claude Code などの MCP クライアントに公開する仕組みです。MCP サーバーはホストに直接インストールされるのではなく、それぞれ専用の Docker コンテナ内で隔離実行されます（起動には `docker run --rm -i --init --security-opt no-new-privileges ...` のようなサンドボックス設定が使われます）。そのため、新しい MCP サーバーを使うたびにホストへ Node.js / Python 等の実行環境を個別に構築する必要がありません。

rootist リポジトリでは、`rootist` という名前の Docker MCP プロファイルに 次の2件を登録しています。

- **`dockerhub`（Docker Hub 公式 MCP サーバー）**: 「このイメージの最新タグを調べて」「このリポジトリの情報を取得して」といった Docker Hub 上のレジストリ操作を自然言語で依頼できます。
- **`context7`（Context7 リモート MCP サーバー）**: better-auth / drizzle-orm / bits-ui / Tailwind CSS v4 などのライブラリについて、バージョンに合った最新ドキュメントとコード例を取得できます（`resolve-library-id` / `query-docs` の2ツール）。Svelte / SvelteKit は Svelte MCP を優先し、Context7 はそれ以外のライブラリに使います（CLAUDE.md 参照）。`context7` はコンテナではなく `https://mcp.context7.com/mcp` へ gateway が中継するリモートサーバーです。

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

### 3-4. （必要な場合のみ）Docker Hub のユーザー名とシークレットを設定する

`dockerhub` サーバーは Docker Hub のユーザー名と Personal Access Token（PAT）を設定すると、自分の名前空間の取得（`getPersonalNamespace`）やプライベートリポジトリの操作が可能になります。未設定でも `search` や公開リポジトリの参照などは動作します。

設定は次の2つです（両方必要です）。

1. **ユーザー名をプロファイルに設定する**

   ```bash
   docker mcp profile config rootist --set dockerhub.username=<Docker Hubのユーザー名>
   ```

   設定値は `docker mcp profile config rootist --get-all` で確認できます。

2. **PAT をシークレットとして登録する**（6章参照）

   PAT は Docker Hub の「Account settings」→「Personal access tokens」で発行します。現状の用途（イメージ検索・リポジトリ情報取得）であれば、Access permissions は **`Repo Read-only`** で十分です。

設定後、`docker mcp gateway run --profile rootist --dry-run` の出力で `dockerhub` の起動引数に `-e HUB_PAT_TOKEN` と `--username=<ユーザー名>` が含まれていれば、両方が gateway に渡っています。

### 3-5. プロファイルに `context7` を追加し、API キーを登録する

```bash
docker mcp profile server add rootist --server catalog://mcp/docker-mcp-catalog/context7
```

`Added 1 server(s) to profile rootist` と出力されれば追加済みです。

Context7 は API キー無しでも動作しますが、レート制限が厳しいため API キーの登録を前提とします。[Context7 のダッシュボード](https://context7.com/dashboard) で API キーを発行し、クリップボードにコピーした状態で次を実行します（シークレットの扱いは6章参照）。

```bash
pbpaste | docker mcp secret set context7.api_key
```

シークレット名は **`context7.api_key`** です（`docker mcp profile show rootist` の `context7` の `secrets:` に記載された `name`）。gateway はこの値を `CONTEXT7_API_KEY` ヘッダーとして Context7 に送ります。登録後、`docker mcp secret ls` に `context7.api_key` を含む行が表示されることを確認してください。gateway はシークレットを起動時に読み込むため、**登録・再登録した後は Claude Code を再起動**してください（再起動しないと古い値のまま `Invalid API key` が返ります）。

### 3-6. Claude Code でプロジェクトスコープの MCP サーバーを承認する

`.mcp.json` はリポジトリに同梱済みです（プロジェクトルート）。このファイルがあると、Claude Code はプロジェクトを開いたときに `MCP_DOCKER` という名前のプロジェクトスコープ MCP サーバーを検出します。Claude Code を再起動（またはプロジェクトを開き直す）と、承認プロンプトが表示されるので承認してください。承認後は `/mcp` コマンドで `MCP_DOCKER` が接続済みとして表示されます。

## 4. 動作確認

以下の3段階で確認します。

### 4-1. プロファイルの内容確認

```bash
docker mcp profile show rootist
```

**期待される出力の特徴**: `servers:` 配下に要素が2件存在し、`snapshot.server.name: dockerhub` と `snapshot.server.name: context7` が含まれていること。`servers:` が空（`servers: []` 相当）の場合はプロファイルにサーバーが登録されていません。

### 4-2. ゲートウェイの dry-run

```bash
docker mcp gateway run --profile rootist --dry-run
```

**期待される出力の特徴**: `> dockerhub: (13 tools)` と `> context7: (2 tools)` のようにサーバーごとのツール数が表示され、`> 15 tools listed in ...` という合計行が出ること。その後 `mcp-find` 等の内部管理ツール（9件）が追加表示されますが、これはカタログ由来のサーバーとは別枠の常設ツールです。最後に `Dry run mode enabled, not starting the server.` と表示されて終了すれば正常です（`--dry-run` を付けない限り、このコマンドは常駐プロセスとして待受を続けるため、動作確認では必ず `--dry-run` を付けてください）。

参考: `--profile` を付けずに `docker mcp gateway run --dry-run` を実行すると `- No server is enabled` / `> 0 tools listed` となり、カタログ由来のツールが1つも出なくなります（内部管理ツール9件は変わらず表示されます）。これが `.mcp.json` の `args` に `--profile rootist` を必ず含める理由です。

### 4-3. Claude Code 側の接続確認

Claude Code の対話セッションで `/mcp` を実行し、`MCP_DOCKER` が接続済みとして一覧に表示され、`dockerhub` 由来のツールに加えて `resolve-library-id` / `query-docs`（Context7）が見えることを確認してください（この手順は Claude Code 本体の UI を介するため、開発者自身の環境で確認する必要があります）。

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
  # トークンをクリップボードにコピーした状態で実行する
  pbpaste | docker mcp secret set dockerhub.pat_token
  ```

  - シークレット名は **`dockerhub.pat_token`** です（`docker mcp profile show rootist` の `secrets:` に記載された `name`）。コンテナ内の環境変数名 `HUB_PAT_TOKEN` で登録しても `dockerhub` サーバーには渡りません。
  - `pbpaste` 経由にすることで、トークンの実値がシェル履歴に残らず、手入力による貼り付けミスも防げます。`echo <token> | ...` のように `<` `>` を含むプレースホルダをそのまま実行すると、zsh がリダイレクトと解釈して `parse error` になります。
  - 登録済みシークレットの一覧は `docker mcp secret ls`、削除は `docker mcp secret rm <name>` で行えます。
  - **既存のシークレットは `secret set` で上書きできません**（`The specified item already exists in the keychain. (-25299)` になります）。登録し直す場合は、先に `docker mcp secret rm dockerhub.pat_token` を実行してください。

- **`.mcp.json`・`.env`・本手順書・`README.md` を含む、リポジトリにコミットされるいかなるファイルにも、シークレットの実値を書いてはいけません。** シークレットは Docker Desktop 側（OS のキーチェーンおよび Secrets Engine プロバイダ）で一元管理され、リポジトリには一切含まれません。

## 7. トラブルシューティング

- **ツールが1つも見えない** → プロファイルが未作成、または `--profile` に渡している名前が `rootist` と一致していない可能性があります。`docker mcp profile show rootist` を実行し、`servers:` が空でないか確認してください。これは本手順で最も踏みやすい失敗です。
- **`getPersonalNamespace` が `InvalidTokenError: Invalid token specified: missing part #2` で失敗する** → PAT のシークレットが未登録（またはシークレット名の誤り）、あるいはユーザー名が未設定です。3-4 と6章の手順で `dockerhub.username` と `dockerhub.pat_token` を設定してください。
- **`getPersonalNamespace` が `Failed to authenticate PAT for <ユーザー名>: 401` で失敗する** → ユーザー名と PAT は gateway に渡っていますが、PAT の値が誤っています（貼り付けミス、失効、削除済みトークンなど）。`docker mcp secret rm dockerhub.pat_token` の後、6章の手順で正しいトークンを登録し直してください。
- **Context7 のツールがレート制限エラーを返す** → API キーが未登録、またはシークレット名が誤っている可能性があります。`docker mcp secret ls` に `context7.api_key` があるか確認し、無ければ 3-5 の手順で登録してください。登録し直す場合は先に `docker mcp secret rm context7.api_key` を実行します。
- **Context7 のツールが `Invalid API key. Please check your API key. API keys should start with 'ctx7sk' prefix.` を返す** → API キーは gateway に渡っていますが、値が誤っています（クリップボードに別の値が入っていた等）。`docker mcp secret rm context7.api_key` の後、`ctx7sk` で始まるキーをコピーした状態で 3-5 の手順で登録し直してください。
- **`--profile` と `--servers` / `--enable-all-servers` は同時に指定できません（相互排他）**。`docker mcp gateway run --help` にも明記されています。`.mcp.json` の `args` にはこの3者のうち `--profile` のみを含めてください。
- **CLI のサブコマンド名はバージョンによって変わります。** 迷ったら `docker mcp profile --help` のように `--help` を付けて実際のサブコマンド一覧を確認してください。参考として、本手順書執筆時点（`docker mcp version` = `v0.43.3`）の `docker mcp profile` サブコマンドは `config` / `create` / `export` / `import` / `list` / `pull` / `push` / `remove` / `server` / `show` / `tools` であり、**`use` や `select` に相当するサブコマンドは存在しません**。
- **公式ドキュメントと実際の CLI 出力が食い違う場合は、実際の CLI 出力を優先してください。** ドキュメントの更新が CLI のリリースに追いついていない場合があります。
- **「起動中のコンテナを一覧して」と Claude Code に頼んでもMCPツールが使われない** → 不具合ではありません。ローカルの Docker デーモンのコンテナ／イメージ管理を行う公式カタログサーバーが存在しないためです（1章「現時点でできないこと」を参照）。この操作は Bash ツールから `docker ps` / `docker images` を直接実行してください。

## 8. 参考リンク

- [Docker MCP Toolkit（公式ドキュメント）](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
- [Docker MCP Gateway（公式ドキュメント）](https://docs.docker.com/ai/mcp-gateway/)
- [Docker MCP Catalog](https://hub.docker.com/mcp)
