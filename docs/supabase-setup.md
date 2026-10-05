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
- worktree 間で DB が**共有**される（issue ごとに DB を分離しない）。スキーマ変更（マイグレーション）が共有 DB に入るのは **main へのマージ時だけ**（「6. スキーマの反映」「14. GitHub 連携」）。未マージのブランチのスキーマが先に入ることも、複数の issue が同時に流すことも、構造的に起きない。
- Free プランは 1 週間アクセスがないと一時停止する。止まったらダッシュボードの Restore から復帰する。
- 将来、オフライン開発や CI での独立した DB が必要になったら Supabase CLI のローカル環境を再検討する。

### 開発用と本番用を分離しない判断（#138。D1）

マイグレーションの自動適用（GitHub 連携）の対象は、この**開発用プロジェクト 1 つ**です。開発用と本番用は分離しません。

- 理由: 本番用プロジェクトを使うアプリ（デプロイ先）がまだ無く、分離しても守る対象が無い。一方で適用し忘れ・手間・共有 DB の状態が main とずれる問題は、分離しなくても「適用経路を main へのマージだけにする」ことで解消できる（共有 DB の変更は必ず main の履歴と一致する）。新しいプロジェクト・接続情報・費用も増えない。
- 代償: マージ前に、Supabase 上の実 DB で新しいスキーマを試せない（使い捨てのローカル Postgres と CI の検査で補う。「16. 失敗時の検知と復旧」の運用ルール）。破壊的変更をマージすると、古い main から切った全 worktree に即座に影響する（「16. 運用ルール」の段階的な出し方）。
- **見直しの条件**: 実ユーザーが使う本番環境をデプロイすることになったら、本番用プロジェクトを分離し、連携先を本番用に切り替える。
- この判断を Notion の ADR として残すかはユーザーが決める（残す場合、ここからはリンクで参照し、同じ説明を二重に書かない）。

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

スキーマの正は **`supabase/migrations/<タイムスタンプ>_<名前>.sql`**（Supabase CLI のマイグレーション。SQL を手で書く）です。ORM やスキーマ定義の TS ファイルはありません。クラウド直結のため `supabase start`・`supabase link` は使わず、`supabase/config.toml` も置きません（`--db-url` で `.env` の `DATABASE_URL` を直接指定します。`config.toml` を置かない理由は「14. GitHub 連携」）。CLI は依存に入れず、`pnpm dlx supabase@<固定版>` で一時実行します（バージョンは `src/lib/dev-tools/supabase-db.ts` の `SUPABASE_CLI`）。

```bash
pnpm db:new add_something   # 1. 空のマイグレーションを作る（DB には触れない。名前の制約は下記）
# 2. supabase/migrations/<ts>_add_something.sql に SQL を手で書く（下の RLS チェックリストを満たすこと）
# 3. PR を出す（CI の migrations チェックが RLS 漏れ・順序・既存ファイルの変更を検査する）
# 4. main へマージする → Supabase の GitHub 連携が未適用分を自動で適用する（手元で何かを流す必要は無い）
pnpm db:status              # 5. マージ後、Local と Remote が一致したことを確認する（読み取りのみ）
```

**`pnpm db:new` に渡せる名前**: 英小文字・数字・`_` のみ（ハイフン・大文字・空白は不可）。生成されるファイル名は `<14 桁の数字>_<名前>.sql` で、CI の検査は `^[0-9]{14}_[a-z0-9_]+\.sql$` に合わないファイルを失敗にします（Supabase CLI は `<数字>_<名前>.sql` に合わないファイルを黙って飛ばし、適用されないため）。ファイルは手で作らず必ず `pnpm db:new` で作ります。

`pnpm db:*` は `.env` の `DATABASE_URL` を自動で読み込みます（手動で export する必要はありません）。シェルで設定済みの `DATABASE_URL` が**空文字も含めて**優先されます。値が空、または `postgres://` / `postgresql://` で始まらない場合は CLI を起動せずエラーで止まります。

### 復旧専用の `pnpm db:migrate`（通常は使わない）

- **通常のスキーマ反映は main へのマージによる自動適用だけです。** `pnpm db:migrate` は、連携が使えない・DB を作り直した等の**復旧時に、ユーザーが判断して実行する**コマンドとして残しています（エージェント（オーケストレーター含む）は実行しません）。共有 DB に DDL を流すためです。
- **マージ前に開発用 DB へ流す使い方は推奨しません。** 流すとマージ時の自動適用が「適用済み」で何もせず、PR の途中で SQL を直した場合に DB と main がずれたまま誰も気づきません。マージ前の SQL の確認は、使い捨てのローカル Postgres で行います（共有 DB には流さない）。
- 対話端末（TTY）でないと拒否されます。流れは「dry-run で適用予定を表示 → 適用対象が無ければ終了 → wrapper が `[y/N]` を確認（既定 No。`y` / `yes` のみ承認）→ 承認時だけ `supabase db push`」です。追加の引数（`--yes` など）は受け付けません。
- **この TTY ガードはセキュリティ境界ではなく、誤操作を防ぐ仕組みです。** `script` コマンドなどで疑似端末を作る、`pnpm dlx supabase@... db push` を直接叩く、といった方法で迂回できます（迂回しないこと）。
- Supabase CLI の `db push` は、**対話端末でない環境では確認プロンプトなしで即適用される**ことを実測で確認しています（`--yes` 無しでも）。そのため非 TTY で `db push` を直接実行してはいけません。
- 対話端末では、wrapper の `[y/N]` に `y` と答えた後に、**CLI 自身の確認（Yes/No の対話 UI）がもう一度表示されます**（二重確認。実測）。wrapper のガードは CLI のプロンプトに依存しない設計です。wrapper の確認文言は接続先を断定しません（接続先は `DATABASE_URL` で決まり、ホスト名などは表示しません）。
- ここでの「`db push`」は Supabase CLI の履歴付きマイグレーション適用です。旧 `pnpm db:push`（履歴を残さず破壊的変更を流し得るため削除済みの別コマンド）とは別物です。

### RLS チェックリスト（表を作る SQL を書くとき）

1. 表を作る SQL と**同じファイル**で `alter table public.<表> enable row level security;` を書く。
2. **ポリシー（`create policy`）は作らない**。
3. 同じファイルで `revoke all on table public.<表> from anon, authenticated, service_role, public;` を書く（identity / serial のシーケンスも同様。理由と全体の方針は「7. アクセス制御の方針」）。
4. 適用後に「7. アクセス制御の方針」の B 手順で、権限が実際に無いこと・Data API から読めないこと（権限エラーになること）を確認する。
5. `pnpm test:unit` の静的検査（`src/lib/dev-tools/migration-rls.test.ts`）が、`supabase/migrations/*.sql` の全表について RLS 有効化漏れ・ポリシーの混入・権限の取り消し漏れ・Data API 用ロールへの `grant` を検出します（CI の `pnpm test` でも走るため、マージ前に漏れが止まります）。限界は検査コード冒頭のコメント参照（`$$` 内の `;`、コメントや文字列内の SQL、シーケンスの取り消し漏れは見ない、など）。

### その他

- 開発用 DB は全 worktree で共有です。適用の順序は**マージ順＝適用順**で、タイムスタンプの順序は CI が検査します（「16. 失敗時の検知と復旧」の運用ルール）。
- 接続は Session pooler（5432）を使います。Transaction pooler（6543）は使いません。
- 適用履歴は Supabase CLI の既定（`supabase_migrations.schema_migrations`）に残ります。
- `--db-url` を引数で渡すため、**DB パスワードが `ps` の出力に見えます**。また CLI のエラー出力に接続文字列が含まれることがあるため、ログやチャットにそのまま貼らないでください。
- DB の閲覧・編集は Supabase ダッシュボードの Table Editor / SQL Editor を使います（専用の DB ブラウザコマンドはありません）。
- 旧認証の 4 テーブル（user / session / account / verification）は #116 で削除済みです。ユーザーは Supabase Auth の `auth.users` が管理し、`auth` / `storage` などの Supabase 管理スキーマにはマイグレーションから触れません。

## 7. アクセス制御の方針

Supabase は `public` スキーマのテーブルを Data API（REST / GraphQL）で公開し得ます。RLS も権限も無いテーブルは、`.env` の publishable key（公開前提のキー）だけで全行が読めてしまいます。ここが `plans` などの表の**アクセス制御の方針の正**です（他の文書は要点だけを書き、この節を参照します）。

### 原則

**表への経路は「アプリのサーバーが DB に直結する経路」の 1 本だけ。Data API（REST / GraphQL）からは、どのキーでも、ログインしていても、読み書きできません。** 共有 URL の閲覧可否（shareId を知っているか）の判断はサーバーが行います。

### 主体ごとの許可（`plans`）

| 主体                                              | 経路                        | 参照                          | 保存             | 変更・削除                         | 理由                                                     |
| ------------------------------------------------- | --------------------------- | ----------------------------- | ---------------- | ---------------------------------- | -------------------------------------------------------- |
| 未ログインの利用者                                | ブラウザ → アプリのサーバー | shareId を知っている 1 件だけ | 可（プラン共有） | 不可（経路が無い）                 | 共有 URL は未ログインで見られる仕様                      |
| ログイン済みの利用者                              | 同上                        | 同上                          | 同上             | 同上                               | `plans` はユーザーと紐付かない。ログインで権限は増えない |
| publishable key（anon ロール）                    | Data API                    | 不可（権限エラー）            | 不可             | 不可                               | 公開前提のキー。持っていれば誰でも叩ける                 |
| ログインユーザーの JWT（authenticated ロール）    | Data API                    | 不可                          | 不可             | 不可                               | 所有者の概念が無く、許可する理由が無い                   |
| secret key（service_role）                        | Data API                    | 不可                          | 不可             | 不可                               | アプリは使わない。漏えい時に一括取得されないようにする   |
| アプリのサーバー（`postgres` ロール、表の所有者） | Session pooler 直結         | 可                            | 可               | 可（コードは参照と追加しかしない） | 唯一の正規経路                                           |
| 開発者（Table Editor / SQL Editor）               | ダッシュボード              | 可                            | 可               | 可                                 | 管理作業。検証データの削除に使う                         |

「shareId を知る人だけが閲覧できる」は、次の 3 点で成り立ちます: shareId はサーバーが発行する推測困難な UUID / サーバーは完全一致の 1 件取得しか提供しない（一覧・検索の経路が無い）/ Data API から表を列挙できない。

### 防御の層

1. **権限が無い**: anon / authenticated / service_role / PUBLIC は表にもシーケンスにも権限を持たない（マイグレーションで `revoke all`）。Data API からのリクエストは「0 件」ではなく**権限エラー（42501）**になる。
2. **RLS 有効・ポリシー無し**: 権限が誤って付与されても行は見えない。ポリシーは作らない。`FORCE ROW LEVEL SECURITY` は付けない（アプリは表の所有者として RLS の対象外で動くため。付けると所有者の接続が止まり得る）。
3. **静的検査**: マイグレーションに `create policy`・Data API 用ロールへの `grant`・取り消し漏れ・RLS 有効化漏れがあると CI（`pnpm test`）で止まる（`src/lib/dev-tools/migration-rls.test.ts`）。

アプリの動作は「表の所有者であること」だけで成り立ち、`BYPASSRLS` の有無に依存しません。

### 表を追加するとき

[「6. スキーマの反映」の RLS チェックリスト](#rls-チェックリスト表を作る-sql-を書くとき)に従い、**同じファイルで** RLS の有効化と `revoke all on table public.<表> from anon, authenticated, service_role, public;` を書きます。`serial` / identity の列があればシーケンスも同様に取り消します。今後作られる表への自動付与（`alter default privileges`）そのものは変えていません（別 issue 候補）。

### 確認手順

ローカルの再現（マージ前）は PR 本文と `.dev-loop/` の記録を参照してください。以下は**マージ後にユーザーが共有 DB で行う**手順です。すべて読み取り、または「拒否されること」を確かめる操作です。

**B-0（マージ前のゲート）**: ダッシュボードの SQL Editor で現状を読む。次の場合は**マージしません**。

```sql
select version();
select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user;
select pg_get_serial_sequence('public.plans', 'id');   -- public.plans_id_seq でなければマージしない（後続のクエリは does not exist で失敗する。そこで止める）
select relname, relowner::regrole from pg_class where oid in ('public.plans'::regclass, 'public.plans_id_seq'::regclass);   -- 所有者が postgres でなければマージしない
```

さらに下の「権限の読み取り」を実行し、grantor に `postgres` 以外が現れたら方針を見直します（取り消しは自分が付与した権限にしか効かないため）。`version()` のメジャー版がローカル検証の 17 と違えば PR 本文に記録します。

**権限の読み取り（B-0 / B-2 共通）**:

```sql
select a.grantee::regrole as grantee, a.grantor::regrole as grantor, a.privilege_type
from pg_class c, aclexplode(c.relacl) a
where c.oid in ('public.plans'::regclass, 'public.plans_id_seq'::regclass)
order by 1, 3;
select attname, attacl from pg_attribute where attrelid = 'public.plans'::regclass and attacl is not null;
select relname, relowner::regrole, relrowsecurity, relforcerowsecurity from pg_class where oid in ('public.plans'::regclass, 'public.plans_id_seq'::regclass);
select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'plans';
```

grantee が PUBLIC の行は `-` と表示されます。

**B-1（適用）**: マージ後、手元で何も流さずに `pnpm db:status` の Local と Remote が一致する。

**B-2（権限が実際に無い）**: 上の「権限の読み取り」で、grantee が表の所有者（`postgres`）だけ、`attacl` が 0 行、`relrowsecurity = t` / `relforcerowsecurity = f` / `policies = 0`。**「マイグレーションが成功した」ではなく、この読み取り結果で合格とします**（取り消しが黙って効かない可能性があるため）。

**B-3（Data API から拒否される）**:

```bash
set -a; . ./.env; set +a
# 陽性対照: 存在しないテーブルは PostgREST のエラー（PGRST205）になる＝キーと URL は有効
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/nonexistent_table" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
# 本体: select=id で行の内容を出さずに確認する
curl -s -D - "$SUPABASE_URL/rest/v1/plans?select=id" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Prefer: count=exact'
# 追加・更新・削除の試行（更新・削除は存在しない share_id で条件を付ける）
curl -s -w '\nHTTP %{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/plans" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d '{"share_id":"b3-probe","data":{}}'
curl -s -w '\nHTTP %{http_code}\n' -X PATCH "$SUPABASE_URL/rest/v1/plans?share_id=eq.b3-nonexistent" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d '{"data":{}}'
curl -s -w '\nHTTP %{http_code}\n' -X DELETE "$SUPABASE_URL/rest/v1/plans?share_id=eq.b3-nonexistent" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

- 参照は **2xx 以外**で行が返らない。本文が権限エラー（`42501`）なら期待どおり（PostgREST が表を見つけられない扱い `PGRST205` でも行は返らないので可）。**`200` と `[]`（空配列）が返ったら不合格**です（権限の取り消しが効いていない。`[]` は「守られている」場合と「たまたま行が無い」場合を区別できない）。
- 追加・更新・削除の試行はすべて 2xx 以外。万一追加が成功したら、ダッシュボードで該当行（`share_id = 'b3-probe'`）を削除してから報告する。
- （任意）GraphQL（`/graphql/v1`）でも `plans` が見えない。

**B-4（アプリは従来どおり）**: ログアウト状態でプランを作って共有 URL を発行し、別のブラウザ（シークレットウィンドウ）で開くと表示される。ログイン状態でも同様。確認に使ったプランはダッシュボードで削除する。

**B-5（認証の公開設定が従来どおり）**: 「9. 認証の設定」の確認コマンドを実行する。

B-2 で権限が残っていた場合は、新しいマイグレーションで直す（「16. 失敗時の検知と復旧」の「前に進めて直す」）前に、連携が流したロールを View logs 等で確認します。issue のクローズは B-0〜B-3 の完了後です。

## 8. 開発者向け移行手順（#115 のマージ後）

MySQL から Supabase の Postgres への切り替えに伴い、各開発者はメインの `.env` で次を行ってください。（#115 当時の手順を記録したものです。現在のスキーマ反映は「6. スキーマの反映」と「14. GitHub 連携」が正で、4 の `db:migrate` は当時の手順のままです。）

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

（#128 当時の手順を記録したものです。現在のスキーマ反映は「6. スキーマの反映」と「14. GitHub 連携」が正で、1・2・4 の `db:migrate` は当時の手順のままです。）

ORM（drizzle-orm）とそのマイグレーション基盤（drizzle-kit）を依存から外し、スキーマの正を `supabase/migrations` に移しました。アプリの DB アクセス経路（Session pooler へ DB 所有者ロールで直結）と public スキーマ（表・列・制約・RLS）は変わりません。

1. `pnpm install` で drizzle 関連が消えます。旧 `pnpm db:generate` / `pnpm db:studio` は無くなりました（DB の閲覧は Supabase ダッシュボード）。`pnpm db:migrate` は Supabase CLI の wrapper に変わり、ユーザーが自分の端末で実行するコマンドになりました。
2. **DB に残る `drizzle` スキーマ（`drizzle.__drizzle_migrations`）は意図的に残置しています。消さないでください。** 理由: 未マージの他ブランチは旧 drizzle-kit のまま `pnpm db:migrate` を実行し得ます。履歴表を消すと 0000 から再適用しようとして、旧認証 4 表を作り直す・失敗するなど共有 DB を汚します。残しておけば「適用済み」と判断されて何も起きません。`drizzle` スキーマは Data API の公開対象（public）外のため、残しても公開範囲の問題はありません。**削除は、旧 drizzle 前提のブランチが無くなったことを確認した後の別 issue で行います。**
3. 未マージの他ブランチで旧 `drizzle/` に新しいマイグレーションを作っている場合は、`supabase/migrations` の SQL に書き直してから適用してください（「6. スキーマの反映」）。
4. **一度きりのベースライン履歴登録**: `supabase/migrations/20261004000000_baseline_plans.sql` は既存 DB と同じ状態を記述したもので、既存 DB では実行させません。履歴だけを登録します（SQL は実行されず、`public` の表には触れません）。共有 DB への書き込みなので、**ユーザーの承認後に実施**します。登録済みかは `pnpm db:status` で確認します（Local と Remote の両方に `20261004000000` があれば登録済み）。未登録のまま GitHub 連携を有効にすると、ベースラインも未適用として流れます（ベースライン SQL は冪等なので失敗・変更は起きません）。連携の有効化前に、必ず登録済みにしてください（「14. GitHub 連携」の前提確認）。登録は次のコマンドで行います。

```bash
cd <リポジトリ>; set -a; . ./.env; set +a
pnpm dlx supabase@2.119.0 migration repair 20261004000000 --status applied --db-url "$DATABASE_URL"
pnpm db:status    # Local と Remote が 20261004000000 で一致していること
```

5. `.env` の `DATABASE_URL` は引き続き Session pooler の文字列です（アプリと Supabase CLI の両方が使います）。パスワードに記号がある場合は URL エンコードしてください。

## 14. GitHub 連携でマイグレーションを自動適用する（#138。初回のみ・1 人が実施）

Supabase の GitHub 連携の「Deploy to production」で、**main へのマージ時に `supabase/migrations/` の未適用分が開発用プロジェクトへ自動で適用される**ようにします。共有 DB へのスキーマ変更の通常経路はこれ 1 本です（「6. スキーマの反映」）。設定（ダッシュボード・GitHub）はユーザーが行い、エージェントは設定を変更しません。

### 仕様の根拠（公式ドキュメントで確認した事実と、未確認の事項）

出典: [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)・[Branching](https://supabase.com/docs/guides/deployment/branching)・[Configuration](https://supabase.com/docs/guides/deployment/branching/configuration)・[Troubleshooting](https://supabase.com/docs/guides/deployment/branching/troubleshooting)・[Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)（2026-10-05 確認）。

- **確認済み**: GitHub からの自動デプロイは「any plan」で使える（Free でも可。Branching の PR ごとのプレビュー DB は Pro 以上で、使わない）。**Deploy to production** を有効にすると、本番ブランチへの push／マージで新しいマイグレーションが適用される。本番へ反映されるのはマイグレーションと、`config.toml` に宣言された Edge Functions・Storage だけで、**Auth などその他の設定と seed は無視される**（「All other configurations, including API, Auth, and seed files, are ignored by default.」）。
- **確認済み**: 履歴は `supabase_migrations.schema_migrations`（CLI と同じ）。未適用分だけが順に流れる。マイグレーションは**ファイル単位の単一トランザクション**で適用されるため、`create index concurrently` のようにトランザクション外でしか流せない SQL は連携では失敗する。
- **`supabase/config.toml` は置きません。** 公式に必須とは書かれておらず（ただし「無しで動く」とも明記されていない。**未確認**。実機で確認する）、置いても得るものが無く、設定の反映に関わるリスクだけが増えるためです。
- **未確認（実機で確認し、結果をここに追記する）**: 連携が #128 のベースライン `20261004000000` を適用済みと扱うか／Branching を使わない構成で GitHub の PR・コミットに Supabase のチェックが現れるか（名前も）／古いタイムスタンプのマイグレーションがマージされたときの挙動／連携が GitHub の CI の成功を待つか（待たない前提で設計している）／失敗したマイグレーションの再実行の仕方／Free プラン固有の制限（一時停止からの復帰直後の挙動など）。

### 前提確認（有効化の前に必ず）

```bash
pnpm db:status    # Local と Remote が一致していること（読み取りのみ）
```

Local と Remote の両方に `20261004000000` がある状態にします。Remote に無い場合は、連携を有効にするとベースラインも未適用として流れます（SQL は冪等で失敗・変更は起きませんが、先に「13. #128 のマージ後」の手順 4 で履歴を登録してください）。

### 設定手順（ダッシュボード）

1. ダッシュボードの **Project Settings > Integrations**（[リンク](https://supabase.com/dashboard/project/_/settings/integrations)）を開く。
2. **GitHub Integration** の **Authorize GitHub** を押し、GitHub の認可画面で **Authorize Supabase** を押す。
3. 戻った画面で、このリポジトリを選ぶ。
4. **Working directory** に `.` を入れる（`supabase/` がリポジトリ直下にあるため）。
5. **Deploy to production** を有効にし、本番ブランチ名が `main` であることを確認する（既定値は**未確認**。違えば変更する）。
6. **Enable integration** を押す。

画面の項目名は公式ドキュメントの記載に従っています。実際の画面と違う場合は、この手順を直してください（PR で追記する）。

**有効にしてはいけない設定**: **Automatic branching**（PR ごとのプレビュー DB。Pro 以上の機能で、この issue の対象外）。

**`config.toml` が無いと連携が動かない場合**: 失敗として検出された場合に限り、`[remotes.*]` を書かない最小の `supabase/config.toml`（秘密情報・project ref を含めない）を追加する別 issue で扱う。本番への Deploy では `config.toml` の Auth 設定は無視されると公式に書かれているが、追加した場合は「9. 認証の設定」の確認コマンドで公開設定が変わっていないことを必ず確かめる。

### 設定後の確認

- **Project Settings > Integrations** の GitHub Integration が有効（リポジトリと Working directory が表示される）で、Deploy to production が有効になっている。
- マージ後は `pnpm db:status` で Local と Remote が一致する。ダッシュボードの Branches 画面の View logs に、デプロイの実行結果が出る（**未確認**。出る場所が違えばここを直す）。
- 「9. 認証の設定」の確認コマンドの結果が従来どおり（`disable_signup=False, mailer_autoconfirm=True, email=True`）。

### 一時的に止める・解除する

Project Settings > Integrations の GitHub Integration で、Deploy to production を無効にする（一時停止）か、連携を解除する。止めている間のスキーマ反映は、復旧用の `pnpm db:migrate`（「6. 復旧専用の `pnpm db:migrate`」）で行う。

### 実施順序（#138 の PR とあわせた手順）

次の順で行います。**マージの後に連携を有効にすると、疎通確認用マイグレーション（`comment_on_plans`）が流れるかを確かめられません。先に有効化してからマージします。**

1. **B-0**: 上記の前提確認。
2. **B-1**: 連携を有効にする（上記の設定手順）。
3. **B-2**: ブランチ保護（「15. ブランチ保護」）。必須チェック `migrations` は、#138 の PR で一度実行された後でないと選べない。
4. **#138 の PR をマージする**。
5. **B-3**: 手元で何も流していないのに `pnpm db:status` の Local と Remote が一致し、`plans` の表コメントが共有 DB に入っている（ダッシュボードの Table Editor / SQL Editor の読み取りで確認）。**B-4**: 連携の結果が、この節に書いた場所で確認できる。**B-5**: 認証の公開設定が従来どおり。

## 15. ブランチ保護（GitHub。ユーザーが設定）

連携は main への push でも動くため、「CI を通らないとマージできない」を保つ関門は GitHub のブランチ保護だけです。main に次の **4 点を必須**で設定します（classic のブランチ保護、またはルールセット。ルールセットでは同じ意味の項目）。

1. **Require status checks to pass before merging** で、必須チェックに **`migrations`**（CI のマイグレーション検査ジョブ。RLS 漏れ・ポリシー混入・既存ファイルの変更・ファイル名形式・タイムスタンプ順を検査する）を指定する。`check` / `lint` / `test` も必須にしてよい。
2. **Require branches to be up to date before merging**（classic の `strict: true`）。**理由**: タイムスタンプ順の検査は「その PR の CI が走った時点の main」としか比べません。strict が無いと、PR-A（T1）と PR-B（T2 > T1）がどちらも成功し、B が先にマージされた後に A がそのままマージされて、T1 < T2 の逆順で適用されてしまいます。strict なら、A は main を取り込み直して再検査されます。
3. **管理者もバイパスできない**（classic の `enforce_admins`。ルールセットではバイパス対象を空にする）。バイパスできると、検査を通らない変更や直接 push も連携が適用します。
4. **Require a pull request before merging**（main への直接 push の禁止）。連携は push でも適用するため、直接 push を禁じないと上の 1〜3 の関門を通らずに共有 DB へ入ります。**承認（approval）の必要数は 0 でよい**（個人開発のため。PR 経由であることだけを強制する）。

確認（読み取りのみ。classic のブランチ保護の場合。ルールセットなら `gh api repos/nicozo/Rootist/rulesets` 系で同等の項目を確認する）:

```bash
gh api repos/nicozo/Rootist/branches/main/protection --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, enforce_admins: .enforce_admins.enabled, pr_required: (.required_pull_request_reviews != null)}'
# 期待: strict が true、contexts に "migrations" がある、enforce_admins が true、pr_required が true
```

ルールセットの場合は `gh api repos/nicozo/Rootist/rulesets` 系で、`pull_request` ルール（直接 push の禁止）、`required_status_checks` ルール（`migrations`・strict）、バイパス対象が空であることを確認する。

Supabase 側のチェックが GitHub に現れる場合は、それも必須に加えてよい（現れるかは**未確認**）。

## 16. 失敗時の検知と復旧、運用ルール

### 気づき方

- マージ後は、**マージした人が結果を確認する**。ダッシュボードの Branches 画面の View logs（デプロイの実行ログとエラーメッセージ。**未確認**の部分あり）と、`pnpm db:status`（Local と Remote の差。通知が届かない種類の失敗、たとえば連携自体が無効になっていた場合にも気づける）を見る。
- 公式はメール通知の購読も勧めている（失敗の通知先は公式ドキュメント上、ブランチへのメール通知。設定画面の場所は**未確認**）。

### 原因の切り分け

| 症状                                 | 見分け方・対処                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL の誤り                           | View logs にエラー。`pnpm db:status` で Remote にそのファイルが無い                                                                            |
| タイムスタンプの逆転                 | 古い時刻のファイルが後から入った。CI の `migrations` が止めるはずなので、保護設定（「15. ブランチ保護」の strict）を確認する。挙動は**未確認** |
| 適用済みファイルの改変               | CI の `migrations` が止める。止まらなかった場合は保護設定を確認する                                                                            |
| トランザクション外でしか流せない SQL | 連携は単一トランザクションで流すため失敗する（公式）。別の方法に分けて書き直す                                                                 |
| Free の一時停止・連携の無効化        | `pnpm db:status` が接続できない／マージ後も Remote が進まない。ダッシュボードで Restore・連携の状態を確認する                                  |
| 連携の設定ミス                       | 「14. 設定後の確認」で Working directory・本番ブランチ・Deploy to production を見直す                                                          |

### 元に戻す・やり直す

Supabase のマイグレーションには自動の巻き戻しがありません。**原則は前に進めて直します。**

**マージ後に適用が失敗したマイグレーションがあるとき**（公式の記述では、未適用分だけを順に流すため、失敗したファイルは履歴に記録されず、以降のデプロイで同じファイルが先頭で再実行されて止まり続ける可能性があります。**未確認（公式の記述からの推定）。ローカルの使い捨て Postgres で CLI の挙動は再現確認済み**）:

1. `pnpm db:status` で Local と Remote の差を確認し、DB に実際に何が入ったかを、ダッシュボードの読み取り（Table Editor / SQL Editor の select）で確認する。マイグレーションは 1 ファイル 1 トランザクションなので、失敗したファイルの SQL は**一度も流れていない**（途中まで入ることは無い。確認して違っていたら次の手順に進まず相談する）。
2. 履歴を整える。失敗したファイル `<ts>_x.sql` を適用済み扱いにする（`migration repair` は**履歴表だけを更新し、SQL は流さない**。公式の Database migrations）。**共有 DB への書き込みなので、ユーザーが判断して実行します（エージェントは実行しない）**:

   ```bash
   cd <リポジトリ>; set -a; . ./.env; set +a
   pnpm dlx supabase@2.119.0 migration repair <ts> --status applied --db-url "$DATABASE_URL"
   pnpm db:status    # Local と Remote が一致していること
   ```

   （`2.119.0` は wrapper が使う版。`src/lib/dev-tools/supabase-db.ts` の `SUPABASE_CLI` と同じにする。）失敗したファイルは main に**残りますが、その SQL は流れていません**。

3. 修正は**新しいマイグレーション**として PR で出し、マージで適用させる。**失敗したファイルの SQL は一度も流れていないので、新しいマイグレーションには「本来行いたかった変更の全体」（修正後の SQL）を書く**（直した差分だけを書くと、意図した変更が欠ける）。失敗したファイルは変更・削除しない（CI の検査が止める）。PR 本文に「失敗した `<ts>_x.sql` は repair で適用済み扱いにした。その SQL は流れていない」と書く。

- 途中まで適用されて履歴と実際がずれた場合: `pnpm db:status` と上記の読み取りで差を確認し、履歴だけを直すときは同じ `migration repair`（`--status applied` か `--status reverted`）を、実際の DB の状態に合わせてユーザーが判断して実行する。公式の注意: repair は**履歴表だけを更新する**。
- 連携が使えない間の逃げ道: `pnpm db:migrate`（復旧専用。dry-run → wrapper の `[y/N]` 確認 → 適用。TTY 必須）。
- 失敗の再実行の仕方: 連携側に再実行ボタンがあるか／次のマージで再試行されるかは**未確認**。

### やってはいけないこと

- 適用済みのマイグレーションファイルを書き換える・消す（DB と main がずれる。直すときは新しいマイグレーションを追加する）。
- 非 TTY で `supabase db push` を直接実行する（確認なしで即適用される）。
- SQL Editor や Table Editor で共有 DB のスキーマを直接変更する（履歴を通らず、以降の適用で失敗する）。
- エージェントに共有 DB を直させる（共有 DB への書き込みはしない）。
- マージ前に開発用 DB へ流す（「6. 復旧専用の `pnpm db:migrate`」）。

### 運用ルール

- **マージ順＝適用順。** マージ前に main を取り込み、必要なら `pnpm db:new` で作り直してタイムスタンプを付け直す（CI の `migrations` が、追加したマイグレーションが main の最新より新しいことを検査する。保護設定の strict と対）。
- **破壊的変更（列・表の削除や改名）は段階的に出す。** 旧コードと新コードの両方が動く段階に分け（追加 → 移行 → 削除を別 PR にする）、他の worktree への影響を PR 本文に書く。
- **マージ前の SQL の確認は、使い捨てのローカル Postgres（Docker）で行う。** 共有 DB には流さない。Supabase 固有のスキーマやロールを参照する SQL は、素の Postgres では再現しきれない。
- CI は空の Postgres に順次適用する検査をしない（今回の対象外）。そのため構文エラーや依存順の誤りは、マージして連携が適用するまで検出されない。

## 17. 開発者向け移行手順（#138 のマージ後）

スキーマ変更の適用方法が変わりました。

1. マイグレーションを適用する手元の作業は不要になりました。`pnpm db:new` → SQL → PR → マージで、連携が適用します。マージ後に `pnpm db:status` で Local と Remote が一致したことを確認します。
2. `pnpm db:migrate` は復旧専用です（通常は使わない。「6. 復旧専用の `pnpm db:migrate`」）。マージ前に開発用 DB へ流さないでください。
3. 新しい CI チェック `migrations` が加わりました。マイグレーションを含む PR では、追加のみ・ファイル名形式・タイムスタンプ順・RLS が検査されます。適用済みのマイグレーションファイルは書き換えられません。
4. 連携の有効化とブランチ保護はユーザーが一度だけ行います（「14. GitHub 連携」「15. ブランチ保護」）。
