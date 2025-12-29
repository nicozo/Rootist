FROM node:25-slim

# pnpmのインストール
RUN npm install -g pnpm@10.26.0

# pnpmの設定
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# ストアの場所を設定
RUN pnpm config set store-dir /app/.pnpm-store --global

# 作業ディレクトリ
WORKDIR /app

# 依存関係ファイルのコピー
COPY package.json pnpm-lock.yaml ./

# 依存関係のインストール（キャッシュマウントを削除）
RUN pnpm install --frozen-lockfile

# アプリケーションコードのコピー
COPY . .

EXPOSE 5173

# 開発サーバー起動
CMD ["pnpm", "dev", "--host"]
