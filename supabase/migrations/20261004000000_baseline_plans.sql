-- issue #128: ベースライン。drizzle/0000 + 0001 適用後の最終状態（public は plans のみ）を記述する。
-- 既存の共有 DB には既に同じ状態で存在するため、履歴登録（migration repair）で適用済みにして流さない。
-- 誤って実行されても失敗・変更が起きないよう冪等に書く。
-- RLS は有効、ポリシーは作らない（Supabase の Data API から publishable key で読めないようにする。
-- アプリは DB 所有者ロールで直結するため影響を受けない）。

create table if not exists public.plans (
	id integer generated always as identity,
	share_id text not null,
	data jsonb not null,
	created_at timestamp with time zone not null default now(),
	constraint plans_pkey primary key (id),
	constraint plans_share_id_unique unique (share_id)
);

alter table public.plans enable row level security;
