# Supabase 環境のセットアップ

rootist の DB・認証を Supabase（Postgres + Supabase Auth）へ移行するための接続環境を用意する手順です（親 issue #113 / #114 / DB の移行は #115）。

## 1. ローカル開発の方式: クラウド直結

**開発用の Supabase クラウドプロジェクト 1 つに、全開発者・全 worktree が直結する**方式を採用します。`supabase start`（Supabase CLI のローカル環境）は使いません。

### 理由

- **目的が Supabase 自体の学習・検証**であり、マネージド版の挙動（Auth・RLS・Google OAuth・ダッシュボード）をそのまま確認するのが最短。ローカル版は Auth メールや OAuth の挙動が本番と異なる部分がある。
- **ローカル環境は重い**。Postgres・Auth・Realtime・Studio 等で 10 前後のコンテナが起動し、#112 の「issue ごとに環境を分離」と組み合わせると、ポート衝突回避（`config.toml` のポート 7 本前後）とメモリ消費が issue 数ぶん増える。
- 親 issue の前提どおり**既存データは持たない**ため、共有の開発 DB が壊れても作り直せばよい。
- クラウド直結なら DB コンテナ自体が不要になる（compose に DB サービスは無い）。

### トレードオフと運用ルール

- ネットワーク接続が必須（オフライン開発は不可）。
- worktree 間で DB が**共有**される（issue ごとに DB を分離しない）。スキーマ変更（マイグレーション）は同時に複数 issue で流さず、流す前にほかの worktree への影響を確認する（詳細は「6. スキーマの反映」）。
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
| `DATABASE_URL`             | Connect > Connection string > Session pooler（`[YOUR-PASSWORD]` を DB パスワードに置換） | **秘密（パスワード含む）** |

`DATABASE_URL` は**アプリと Supabase CLI（マイグレーション）の DB 接続**に使います。Session pooler（ポート 5432）を使うのは、Direct connection が IPv4 非対応のため（自宅回線などで繋がらないことがある）です。**Transaction pooler（ポート 6543）は使いません**（プリペアドステートメントが使えず、アプリ側の設定が必要になるため）。

### 接続確認

```bash
set -a; . ./.env; set +a

# API への疎通（HTTP 200 と GoTrue の JSON が返れば URL とキーが有効）
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"

# DB への疎通（「1」が返れば成功。psql が無ければ Docker 経由）
docker run --rm postgres:17 psql "$DATABASE_URL" -tAc 'select 1'
```

つまずきやすい点:

- `SUPABASE_URL` は `https://<project-ref>.supabase.co` までにする。Connect 画面からコピーすると末尾に `/rest/v1/` が付くことがあるので削除する（付いたままだと上記の API 確認が 404 になる）。
- `DATABASE_URL` の `[YOUR-PASSWORD]` は、角括弧ごと DB パスワードに置き換える。パスワードに記号が含まれる場合は URL エンコードする。

`.env` は `.gitignore` 済みです。`SUPABASE_SECRET_KEY` と DB パスワードをコードやコミットに含めないでください。

## 4. git worktree との関係（#112）

- worktree の `.env` はメインからコピーするため、Supabase の 4 項目は**全 worktree で同じ値**になります。issue 別に書き換える必要はありません。
- 一方、アプリのポート（`DEV_PORT` = 20000+N）は issue ごとに異なります。Auth のリダイレクト先がずれないよう、Redirect URLs はワイルドカードで登録しています（上記 2-3）。
- Google ログインの設定手順は「11. Google ログイン」を参照。

## 5. Supabase MCP

公式 Supabase MCP は**導入しません**（必須ではないため）。導入する場合は、アクセストークンを `.mcp.json` などリポジトリ管理下のファイルに書かず、環境変数や Docker のシークレットで渡してください。

## 6. スキーマの反映（マイグレーション）

スキーマの正は **`supabase/migrations/<タイムスタンプ>_<名前>.sql`**（Supabase CLI のマイグレーション。SQL を手で書く）です。ORM やスキーマ定義の TS ファイルはありません。クラウド直結のため `supabase start`・`supabase link`・`supabase/config.toml` は使いません（`--db-url` で `.env` の `DATABASE_URL` を直接指定します）。CLI は依存に入れず、`pnpm dlx supabase@<固定版>` で一時実行します（バージョンは `src/lib/dev-tools/supabase-db.ts` の `SUPABASE_CLI`）。

```bash
pnpm db:new add_something   # 1. 空のマイグレーションを作る（名前は英小文字・数字・_ のみ。DB には触れない）
# 2. supabase/migrations/<ts>_add_something.sql に SQL を手で書く（下の RLS チェックリストを満たすこと）
pnpm db:status              # 3. 適用状況の確認（読み取りのみ。Local と Remote の差を見る）
pnpm db:migrate             # 4. 適用（ユーザーが自分の端末で実行する。下記）
pnpm db:status              # 5. Local と Remote が一致したことを確認
```

`pnpm db:*` は `.env` の `DATABASE_URL` を自動で読み込みます（手動で export する必要はありません）。シェルで設定済みの `DATABASE_URL` が**空文字も含めて**優先されます。値が空、または `postgres://` / `postgresql://` で始まらない場合は CLI を起動せずエラーで止まります。

### 適用（`pnpm db:migrate`）のルール

- **ユーザーが自分の端末で実行します。エージェント（オーケストレーター含む）は実行せず、ユーザーに依頼します。** 共有 DB に DDL を流すためです。
- 対話端末（TTY）でないと拒否されます。流れは「dry-run で適用予定を表示 → 適用対象が無ければ終了 → wrapper が `[y/N]` を確認（既定 No。`y` / `yes` のみ承認）→ 承認時だけ `supabase db push`」です。追加の引数（`--yes` など）は受け付けません。
- **この TTY ガードはセキュリティ境界ではなく、誤操作を防ぐ仕組みです。** `script` コマンドなどで疑似端末を作る、`pnpm dlx supabase@... db push` を直接叩く、といった方法で迂回できます（迂回しないこと）。
- Supabase CLI の `db push` は、**対話端末でない環境では確認プロンプトなしで即適用される**ことを実測で確認しています（`--yes` 無しでも）。そのため非 TTY で `db push` を直接実行してはいけません。
- 対話端末では、wrapper の `[y/N]` に `y` と答えた後に、**CLI 自身の確認（Yes/No の対話 UI）がもう一度表示されます**（二重確認。実測）。wrapper のガードは CLI のプロンプトに依存しない設計です。wrapper の確認文言は接続先を断定しません（接続先は `DATABASE_URL` で決まり、ホスト名などは表示しません）。
- ここでの「`db push`」は Supabase CLI の履歴付きマイグレーション適用です。旧 `pnpm db:push`（履歴を残さず破壊的変更を流し得るため削除済みの別コマンド）とは別物です。

### RLS チェックリスト（表を作る SQL を書くとき）

1. 表を作る SQL と**同じファイル**で `alter table public.<表> enable row level security;` を書く。
2. **ポリシー（`create policy`）は作らない**（Data API から publishable key で読めない状態を保つ。アプリは DB 所有者ロールで直結するため影響を受けない）。
3. 適用後に「7. テーブルの公開範囲（RLS）」の curl で、Data API から読めない（`[]` または権限エラー）ことを確認する。
4. `pnpm test:unit` の静的検査（`src/lib/dev-tools/migration-rls.test.ts`）が、`supabase/migrations/*.sql` の全表について RLS 有効化漏れとポリシーの混入を検出します（CI の `pnpm test` でも走るため、マージ前に漏れが止まります）。限界は検査コード冒頭のコメント参照（`$$` 内の `;`、コメントや文字列内の SQL など）。

### その他

- 開発用 DB は全 worktree で共有です。**マイグレーションは同時に複数の issue から流さず**、流す前にほかの worktree への影響を確認してください。
- 接続は Session pooler（5432）を使います。Transaction pooler（6543）は使いません。
- 適用履歴は Supabase CLI の既定（`supabase_migrations.schema_migrations`）に残ります。
- `--db-url` を引数で渡すため、**DB パスワードが `ps` の出力に見えます**。また CLI のエラー出力に接続文字列が含まれることがあるため、ログやチャットにそのまま貼らないでください。
- DB の閲覧・編集は Supabase ダッシュボードの Table Editor / SQL Editor を使います（専用の DB ブラウザコマンドはありません）。
- 旧認証の 4 テーブル（user / session / account / verification）は #116 で削除済みです。ユーザーは Supabase Auth の `auth.users` が管理し、`auth` / `storage` などの Supabase 管理スキーマにはマイグレーションから触れません。

## 7. テーブルの公開範囲（RLS）

Supabase は `public` スキーマのテーブルを Data API（REST）で公開し得ます。RLS が無効だと、`.env` の publishable key（公開前提のキー）だけで全行が読めてしまいます。

- **作成する全テーブルで RLS を有効にし、ポリシーは作りません**（マイグレーションで `create table` するときは、同じファイルで `alter table ... enable row level security` を書きます。「6. スキーマの反映」の RLS チェックリスト）。アプリはサーバーから DB 所有者ロールで直結するため影響を受けません。
- **テーブルを追加するときも必ず RLS を有効化してください。** 漏れは静的検査テストが検出します。
- Data API から読めないことの確認（`plans` の例。`[]` または権限エラーが返れば OK。行が返れば NG）:

```bash
set -a; . ./.env; set +a
# 陽性対照: 存在しないテーブルは PostgREST のエラー（PGRST205）になる＝キーと URL は有効
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/nonexistent_table" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
# 本体: select=id で行の内容を出さずに確認する
curl -s -D - "$SUPABASE_URL/rest/v1/plans?select=id" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Prefer: count=exact'
```

## 8. 開発者向け移行手順（#115 のマージ後）

MySQL から Supabase の Postgres への切り替えに伴い、各開発者はメインの `.env` で次を行ってください。

1. `DATABASE_URL` を Supabase の Session pooler 文字列に置き換える（旧 `SUPABASE_DB_URL` の値をそのまま移せばよい）。
2. 旧変数 `SUPABASE_DB_URL` の行を削除する。
3. すでに作成済みの worktree（`DATABASE_URL` が `localhost:<MYSQL_PORT>` に書き換わっているもの）は、同じく Supabase の値に直す。以後、新しい worktree では `DATABASE_URL` を書き換えない（メインと同じ値のまま使う）。
4. スキーマは #115 の作業中に開発用クラウド DB へ適用済み。DB を作り直した場合のみマイグレーションを適用する（#128 以降は「6. スキーマの反映」の手順で、ユーザーが自分の端末で `pnpm db:migrate`）。

影響: 既存のユーザーアカウントと共有 URL は引き継がれず失効します（開発段階のため許容）。ブラウザに残った旧セッション Cookie は無効になり、未ログイン扱いになります。

## 9. 認証（Supabase Auth）の設定（#116。初回のみ・1 人が実施）

email/password 認証は Supabase Auth で行います。次をダッシュボードで設定してください（アプリ側は設定を変更しません）。

1. **Authentication > Sign In / Providers > Email**: Email プロバイダが有効で、新規登録（Allow new users to sign up）が許可されていること。
2. 同じ画面の **Confirm email を OFF** にする。rootist はメール確認を実装していないため、登録後にそのままログイン状態で `/plan` へ進む体験を保つのが理由です（ON のままだと登録してもセッションが返らず、登録画面に「登録に失敗しました」と出ます）。
3. 同じ画面（または Authentication > Policies）の **Minimum password length を 8** にする（アプリ側も 8 文字未満を事前に弾きます。最大は Supabase の上限 72 バイト）。

設定の確認（publishable key で Auth の公開設定を取得。`mailer_autoconfirm` が `true` なら Confirm email は OFF）:

```bash
set -a; . ./.env; set +a
curl -s "$SUPABASE_URL/auth/v1/settings" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print({k: d.get(k) for k in ['disable_signup','mailer_autoconfirm']}, 'email:', d['external']['email'])"
# 期待値: disable_signup=False, mailer_autoconfirm=True, email=True
```

仕組みと注意:

- セッションは Supabase の Cookie（`sb-` で始まる名前、**HttpOnly**）で持ちます。ブラウザ用の Supabase クライアントは作らず、登録・ログイン・ログアウトはサーバー（Form Actions）だけが Supabase Auth と通信します。
- `SUPABASE_SECRET_KEY` はアプリのコードから使いません（手元の管理作業用）。
- Supabase Auth の回数制限は IP 単位です。Form Actions 経由だと全利用者がサーバーの IP にまとまるため、短時間に登録・ログインを繰り返すと「試行回数が多すぎます」と表示されます。
- 開発中に作ったテストユーザーは、ダッシュボードの **Authentication > Users** から削除するか、管理 API（`DELETE $SUPABASE_URL/auth/v1/admin/users/<id>`、Secret key を使う手元の管理作業のみ）で削除します。

## 10. 開発者向け移行手順（#116 のマージ後）

1. メインの `.env` に残っている旧認証用の環境変数は削除してよい（残っていても無害）。
2. 既存のアカウントは使えなくなります。新規登録し直してください。ブラウザに残った旧 Cookie は自動的に未ログイン扱いになります。
3. 旧認証 4 テーブルの削除（#128 以前の `0001` マイグレーション）は適用済みです。適用すると、そうしたブランチではログイン・登録ができなくなります（プラン作成・共有は影響を受けません）。
4. 新しい worktree の `.env` に設定するキーは 2 つ（`COMPOSE_PROJECT_NAME` / `DEV_PORT`）です（#119 で `MYSQL_PORT` は廃止）。
5. Google ログインを使うには、「11. Google ログイン」の設定をして `.env` に `GOOGLE_AUTH_ENABLED=true` を追加する。メインの `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は不要になった（Supabase ダッシュボードに登録する）。

## 11. Google ログイン（#117）

Google 認証は Supabase Auth の OAuth（PKCE）で行います。アプリは `POST /auth/google` で Supabase の認可 URL へ送り、Google から戻る `GET /auth/callback` で認可コードをセッションに交換します。失敗・キャンセルは `/login?error=google` に戻り、固定の日本語メッセージを表示します。

### 設定手順（初回のみ・手作業）

1. **Google Cloud Console** > APIs & Services > Credentials で OAuth 2.0 クライアント ID（種類: ウェブアプリケーション）を作成する。
   - **承認済みのリダイレクト URI**: Supabase ダッシュボードの Authentication > Sign In / Providers > Google に表示される Callback URL（`https://<project-ref>.supabase.co/auth/v1/callback`）を登録する。アプリのポートは登録不要（worktree のポート 20000+N でも動く）。旧認証用に登録していたリダイレクト URI は削除してよい。
2. **Supabase ダッシュボード** > Authentication > Sign In / Providers > Google を有効にし、Client ID / Client Secret を貼る。Client Secret はここにだけ置き、リポジトリや `.env` に書かない。
3. Redirect URLs に `http://localhost:*/**`（2-3 で設定済み）が入っていることを確認する。
4. `.env` に `GOOGLE_AUTH_ENABLED=true` を設定する。**未設定・`true` 以外なら Google ボタンは出ず**、email/password のログインや開発は影響を受けない（Google の認証情報が無い環境向け）。`POST /auth/google` を直接叩かれても 404 にする。

### 同じメールアドレスの扱い（決定事項）

Supabase Auth の既定どおり、**同じメールアドレスの identity は 1 つのユーザーに自動で統合される**（アプリ側で独自のリンク処理はしない）。

- email/password で登録済みのメールで Google ログインすると、同じユーザー（`auth.users` の同じ行）としてログインする。逆（Google が先）の場合、同じメールで email/password 登録を試みると登録済みとして扱われる。
- Supabase は、メール未確認の email/password アカウントがあるときに同じメールで Google ログインされた場合、乗っ取り（事前登録による pre-hijacking）を防ぐため未確認側を無効化する。このプロジェクトは「Confirm email」を OFF にしているため、この挙動を前提にしている。
- 表示名・画像は `user_metadata`（`name` → `full_name` → メールのローカル部、`avatar_url` / `picture`）から決まる。
- 旧認証時代の既存ユーザーとの移行・リンクはしない（親 issue #113 の「作り直し」前提）。

### 動作確認

`GOOGLE_AUTH_ENABLED=true` で `pnpm dev` し、`/login` の「Googleでログイン」から認証する。ログイン後は `/plan` へ遷移する。Google の画面でキャンセルすると `/login` に戻り、エラーメッセージが出る。テストユーザーは Authentication > Users から削除する。

## 12. 開発者向け移行手順（#119 のマージ後）

旧構成（MySQL）の残骸を削除したため、各開発者は次を行ってください。

1. メインの `.env` から `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `MYSQL_ROOT_PASSWORD` / `RESEND_API_KEY` を削除してよい（残っていても無害）。worktree の `.env` の `MYSQL_PORT` も同様。
2. 手元に残った旧 MySQL のコンテナ・ボリュームは不要。`docker compose down -v --remove-orphans` で片付けられる（メインは `rootist`、issue 環境は `rootist-issue-<N>` のプロジェクト）。
3. prod コンテナ（`docker compose --profile prod up`）は `.env` の `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `GOOGLE_AUTH_ENABLED` / `GOOGLE_MAPS_API_KEY` / `GEMINI_API_KEY` を受け取って起動する。

## 13. 開発者向け移行手順（#128 のマージ後）

ORM（drizzle-orm）とそのマイグレーション基盤（drizzle-kit）を依存から外し、スキーマの正を `supabase/migrations` に移しました。アプリの DB アクセス経路（Session pooler へ DB 所有者ロールで直結）と public スキーマ（表・列・制約・RLS）は変わりません。

1. `pnpm install` で drizzle 関連が消えます。旧 `pnpm db:generate` / `pnpm db:studio` は無くなりました（DB の閲覧は Supabase ダッシュボード）。`pnpm db:migrate` は Supabase CLI の wrapper に変わり、ユーザーが自分の端末で実行するコマンドになりました。
2. **DB に残る `drizzle` スキーマ（`drizzle.__drizzle_migrations`）は意図的に残置しています。消さないでください。** 理由: 未マージの他ブランチは旧 drizzle-kit のまま `pnpm db:migrate` を実行し得ます。履歴表を消すと 0000 から再適用しようとして、旧認証 4 表を作り直す・失敗するなど共有 DB を汚します。残しておけば「適用済み」と判断されて何も起きません。`drizzle` スキーマは Data API の公開対象（public）外のため、残しても公開範囲の問題はありません。**削除は、旧 drizzle 前提のブランチが無くなったことを確認した後の別 issue で行います。**
3. 未マージの他ブランチで旧 `drizzle/` に新しいマイグレーションを作っている場合は、`supabase/migrations` の SQL に書き直してから適用してください（「6. スキーマの反映」）。
4. **一度きりのベースライン履歴登録**: `supabase/migrations/20261004000000_baseline_plans.sql` は既存 DB と同じ状態を記述したもので、既存 DB では実行させません。履歴だけを登録します（SQL は実行されず、`public` の表には触れません）。共有 DB への書き込みなので、**ユーザーの承認後に実施**します。登録済みかは `pnpm db:status` で確認します（Local と Remote の両方に `20261004000000` があれば登録済み）。未登録のまま次のマイグレーションを `pnpm db:migrate` すると、ベースラインも適用対象として表示されます。その場合は先に下記を実施してください（ベースライン SQL は冪等なので、誤って流れても失敗・変更は起きません）。

```bash
cd <リポジトリ>; set -a; . ./.env; set +a
pnpm dlx supabase@2.119.0 migration repair 20261004000000 --status applied --db-url "$DATABASE_URL"
pnpm db:status    # Local と Remote が 20261004000000 で一致していること
```

5. `.env` の `DATABASE_URL` は引き続き Session pooler の文字列です（アプリと Supabase CLI の両方が使います）。パスワードに記号がある場合は URL エンコードしてください。
