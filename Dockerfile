# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ1: ベースイメージ（共通設定）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:25-slim AS base

# pnpmのインストール
RUN npm install -g pnpm@10.28.0

# pnpmの設定
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# ストアの場所を設定
RUN pnpm config set store-dir /app/.pnpm-store --global

# 作業ディレクトリ
WORKDIR /app

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ステージ2: 依存関係のインストール
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS dependencies

# 依存関係ファイルのみコピー（キャッシュ効率化）
COPY package.json pnpm-lock.yaml ./

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
RUN pnpm build

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
FROM node:25-slim AS production

# pnpmのインストール（本番環境でも必要な場合）
RUN npm install -g pnpm@10.25.0

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
