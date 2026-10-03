# Supabase 環境のセットアップ

rootist の DB・認証を Supabase（Postgres + Supabase Auth）へ移行するための接続環境を用意する手順です（親 issue #113 / 本 issue #114）。

## 1. ローカル開発の方式: クラウド直結

**開発用の Supabase クラウドプロジェクト 1 つに、全開発者・全 worktree が直結する**方式を採用します。`supabase start`（Supabase CLI のローカル環境）は使いません。

### 理由

- **目的が Supabase 自体の学習・検証**であり、マネージド版の挙動（Auth・RLS・Google OAuth・ダッシュボード）をそのまま確認するのが最短。ローカル版は Auth メールや OAuth の挙動が本番と異なる部分がある。
- **ローカル環境は重い**。Postgres・Auth・Realtime・Studio 等で 10 前後のコンテナが起動し、#112 の「issue ごとに環境を分離」と組み合わせると、ポート衝突回避（`config.toml` のポート 7 本前後）とメモリ消費が issue 数ぶん増える。
- 親 issue の前提どおり**既存データは持たない**ため、共有の開発 DB が壊れても作り直せばよい。
- 「MySQL コンテナなしで動く」要件は、クラウド直結なら DB コンテナ自体が不要になるので満たせる。

### トレードオフと運用ルール

- ネットワーク接続が必須（オフライン開発は不可）。
- worktree 間で DB が**共有**される（#112 の MySQL のような issue 別分離はしない）。スキーマ変更（マイグレーション）は同時に複数 issue で流さず、流す前にほかの worktree への影響を確認する。
- Free プランは 1 週間アクセスがないと一時停止する。止まったらダッシュボードの Restore から復帰する。
- 将来、オフライン開発や CI での独立した DB が必要になったら Supabase CLI のローカル環境を再検討する。

## 2. Supabase プロジェクトの用意（初回のみ・1 人が実施）

1. [supabase.com](https://supabase.com/dashboard) でアカウントを作成し、新規プロジェクトを作る（Region は `Northeast Asia (Tokyo)`、プラン Free）。
2. **Database password** を発行し、パスワードマネージャーに保存する（後から確認できない）。
3. Authentication > URL Configuration を設定する。
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs**: `http://localhost:*/**`（worktree のポート 20000+N でも動くようワイルドカード）
4. 開発者に共有する値（URL・各キー・DB パスワード）は、パスワードマネージャー等の安全な経路で渡す。チャットや issue に貼らない。

## 3. 開発者のセットアップ手順

```bash
cp .env.example .env
```

`.env` の Supabase 関連 4 項目を埋めます。ダッシュボードの場所は次のとおりです。

| 変数                       | 取得場所                                                                                 | 公開可否                   |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| `SUPABASE_URL`             | Project Settings > API > Project URL                                                     | 公開可                     |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings > API Keys > Publishable key（`sb_publishable_...`）                    | 公開可（RLS 前提）         |
| `SUPABASE_SECRET_KEY`      | Project Settings > API Keys > Secret key（`sb_secret_...`）                              | **秘密・サーバー専用**     |
| `SUPABASE_DB_URL`          | Connect > Connection string > Session pooler（`[YOUR-PASSWORD]` を DB パスワードに置換） | **秘密（パスワード含む）** |

Session pooler を使うのは、Direct connection が IPv4 非対応のため（自宅回線などで繋がらないことがある）です。

### 接続確認

```bash
set -a; . ./.env; set +a

# API への疎通（HTTP 200 と GoTrue の JSON が返れば URL とキーが有効）
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"

# DB への疎通（「1」が返れば成功。psql が無ければ Docker 経由）
docker run --rm postgres:17 psql "$SUPABASE_DB_URL" -tAc 'select 1'
```

つまずきやすい点:

- `SUPABASE_URL` は `https://<project-ref>.supabase.co` までにする。Connect 画面からコピーすると末尾に `/rest/v1/` が付くことがあるので削除する（付いたままだと上記の API 確認が 404 になる）。
- `SUPABASE_DB_URL` の `[YOUR-PASSWORD]` は、角括弧ごと DB パスワードに置き換える。パスワードに記号が含まれる場合は URL エンコードする。

`.env` は `.gitignore` 済みです。`SUPABASE_SECRET_KEY` と DB パスワードをコードやコミットに含めないでください。

## 4. git worktree との関係（#112）

- worktree の `.env` はメインからコピーするため、Supabase の 4 項目は**全 worktree で同じ値**になります。issue 別に書き換える必要はありません。
- 一方、アプリのポート（`DEV_PORT` = 20000+N）は issue ごとに異なります。Auth のリダイレクト先がずれないよう、Redirect URLs はワイルドカードで登録しています（上記 2-3）。
- Google ログインは従来どおり Google Cloud Console 側のリダイレクト URI の制約があります（#117 で Supabase 経由に切り替える際に再整理）。

## 5. Supabase MCP

公式 Supabase MCP は**導入しません**（必須ではないため）。導入する場合は、アクセストークンを `.mcp.json` などリポジトリ管理下のファイルに書かず、環境変数や Docker のシークレットで渡してください。
