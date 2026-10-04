-- issue #138: GitHub 連携によるマージ時の自動適用の疎通確認用。
-- 表・列・データには触れず、plans 表に説明コメントを付けるだけ（何度流しても結果は同じ）。
comment on table public.plans is '生成した旅行プランの保存先。share_id で共有 URL から引く（RLS 有効・ポリシー無し。アプリは DB 所有者ロールで直結）';
