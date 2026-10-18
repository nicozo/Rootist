# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ1: ベースイメージ（共通設定）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Node のバージョンの正は .nvmrc。Dockerfile はファイルを ARG に読み込めないため、既定値をここに 1 か所だけ書き、
# scripts/node-version.test.ts が .nvmrc との一致を検証する（各 FROM はこの ARG を参照する）
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS base

# 作業ディレクトリ
WORKDIR /app

# pnpmのインストール
# CorepackはNode.js25以降は同梱されない（24では同梱だが将来の追従で壊れるため使わない）。npmで明示的にインストールする
# バージョンの正は package.json の packageManager だけ。ここでは書かずに読み取る
# （package.json だけを先にコピーするので、ソースの変更では pnpm 取得のレイヤーは無効化されない）
# packageManager が "pnpm@<数字>.<数字>.<数字>" の形でなければ、latest などに倒れずビルドを失敗させる
COPY package.json ./
RUN set -eu; \
    PNPM_VERSION="$(node -e "const m = /^pnpm@(\\d+\\.\\d+\\.\\d+)\$/.exec(require('./package.json').packageManager || ''); if (!m) { console.error('package.json の packageManager が pnpm@<major>.<minor>.<patch> の形式ではありません'); process.exit(1); } console.log(m[1]);")"; \
    [ -n "$PNPM_VERSION" ]; \
    npm install -g "pnpm@${PNPM_VERSION}"; \
    [ "$(pnpm --version)" = "$PNPM_VERSION" ]

# pnpmの設定
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# ストアの場所を設定
RUN pnpm config set store-dir /app/.pnpm-store --global

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ2: 依存関係のインストール
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS dependencies

# 依存関係ファイルのみコピー（キャッシュ効率化）
# pnpm-workspace.yaml には catalog・overrides・allowBuilds・engineStrict があり、install が読むため必須
# SvelteKit の設定は vite.config.ts にある。無いと prepare の svelte-kit sync が "Missing config" で警告するためコピーする
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.ts* ./

# 開発用も含めて一気にインストール（frozen-lockfile で整合性を担保）
RUN pnpm install --frozen-lockfile

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ3: ビルドステージ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS builder

# 依存関係をコピー
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/.pnpm-store ./.pnpm-store

# ソースコードをコピー
COPY . .

# ビルド実行
# 環境変数は build 時にも検証されるため .env が要る。COPY ではなく secret マウントで渡し、イメージのレイヤーに残さない
# （.dockerignore が .env を除外している。docker build は --secret id=env,src=.env を付ける。compose は prod の build.secrets が付ける）
RUN --mount=type=secret,id=env,target=/app/.env,required pnpm build

# ビルド成果物と本番依存関係のみを残す
RUN pnpm prune --prod

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ4: 開発環境
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS development

# 開発用依存関係をコピー
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/.pnpm-store ./.pnpm-store

# ソースコードをコピー
COPY . .

# 開発サーバーポート
EXPOSE 5173

# 開発サーバー起動
CMD ["pnpm", "dev", "--host"]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ5: 本番環境（最終イメージ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:${NODE_VERSION}-slim AS production

# 非rootユーザーの作成（セキュリティ向上）
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# ビルド成果物と本番依存関係のみコピー
COPY --from=builder --chown=appuser:appuser /app/build ./build
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# 非rootユーザーに切り替え
USER appuser

# 本番サーバーポート
EXPOSE 3000

# ヘルスチェック（オプション）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 本番サーバー起動
CMD ["node", "build"]
