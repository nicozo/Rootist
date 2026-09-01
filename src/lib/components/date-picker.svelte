<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Calendar } from '$lib/components/ui/calendar';
	import { CalendarDays } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { isPlanDate, formatPlanDate } from '$lib/plan-date';

	// date-picker.svelte（issue #73）: プラン全体の日付を選ぶPopover + Calendar。
	// 外部インターフェースは time-picker.svelte に揃える（value/id/onValueChange）。
	// value/onValueChange は必ず "YYYY-MM-DD" 文字列に閉じ、Date型・CalendarDate型を境界に出さない。
	let {
		value = $bindable(''),
		id,
		onValueChange
	}: {
		value?: string;
		id?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	let open = $state(false);

	// Calendar内部表現（CalendarDate）への変換は境界内に閉じる。isPlanDateで検証済みの
	// 値のみをparseDateに渡す（形式外の値をCalendarへ渡さないため）。
	const selectedDate = $derived(isPlanDate(value) ? parseDate(value) : undefined);

	// カレンダーの表示月（placeholder）はCalendar内部のロービングtabindex/矢印キー操作で
	// 自由に書き換わる状態のため、selectedDateにreactiveに追従させ続けると
	// （毎レンダリングで上書きしてしまい）キーボードでの月内移動を破壊する。
	// Popoverを開いた瞬間にだけ現在値の月へ同期し、開いている間は内部の変更に任せる。
	let placeholder = $state<DateValue | undefined>(undefined);
	$effect(() => {
		if (open) placeholder = selectedDate;
	});

	function handleSelect(date: DateValue | undefined) {
		if (!date) return;
		const next = date.toString();
		value = next;
		onValueChange?.(next);
		open = false;
	}

	function clear() {
		value = '';
		onValueChange?.('');
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				aria-label="日付"
				class={cn('w-full justify-start sm:w-56', !value && 'text-muted-foreground')}
			>
				<CalendarDays data-icon="inline-start" />
				{isPlanDate(value) ? formatPlanDate(value) : '日付を指定'}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0">
		<Calendar
			type="single"
			locale="ja-JP"
			value={selectedDate}
			onValueChange={handleSelect}
			bind:placeholder
		/>
		{#if value}
			<div class="border-t p-2">
				<Button variant="ghost" size="sm" class="w-full" onclick={clear}>指定なしに戻す</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
