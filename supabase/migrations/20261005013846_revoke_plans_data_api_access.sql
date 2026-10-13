-- issue #118: plans を Data API（REST / GraphQL）の全ロールから権限ごと切り離す。
-- RLS（有効・ポリシー無し）はそのまま維持し、「権限が無い」という防御の層を足す（方針は docs/supabase-setup.md の「7. アクセス制御の方針」）。
-- アプリは表の所有者として直結するため影響を受けない。所有者の権限には触れない。
-- 何度流しても結果は同じ（冪等）。取り消しは自分が付与した権限にしか効かないため、マージ後に実際の権限を読み取りで確認する（同 docs の B-2）。

revoke all on table public.plans from anon, authenticated, service_role, public;
revoke all on sequence public.plans_id_seq from anon, authenticated, service_role, public;

comment on table public.plans is '生成した旅行プランの保存先。share_id で共有 URL から引く（RLS 有効・ポリシー無し・Data API 用ロールの権限は取り消し済み。アプリは DB 所有者ロールで直結。方針は docs/supabase-setup.md の「7. アクセス制御の方針」）';
