<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { Clock } from '@lucide/svelte';

	// 値は "HH:MM" 文字列（未選択は ""）。既存 startTime 契約を維持。
	// clearable: 「指定なし」に戻せる任意項目として使う場合に true（issue #70 の訪問時刻）。
	// labelPrefix: 1画面に複数の時刻選択が並ぶ場合にアクセシブルな名前を区別するための接頭辞。
	// showIcon: 隣に別の時間系入力が並び時計アイコンが重複する場合に false にしてラベルへ譲る。
	// onValueChange: bind せず親側で変更を加工したい場合（訪問時刻と時間帯の排他など）に使う。
	let {
		value = $bindable(''),
		id,
		clearable = false,
		size = 'default',
		labelPrefix = '',
		showIcon = true,
		onValueChange
	}: {
		value?: string;
		id?: string;
		clearable?: boolean;
		size?: 'sm' | 'default';
		labelPrefix?: string;
		showIcon?: boolean;
		onValueChange?: (value: string) => void;
	} = $props();

	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = ['00', '15', '30', '45'];

	const hour = $derived(value ? value.split(':')[0] : '');
	const minute = $derived(value ? value.split(':')[1] : '');

	const hourLabel = $derived(labelPrefix ? `${labelPrefix}の時` : '時');
	const minuteLabel = $derived(labelPrefix ? `${labelPrefix}の分` : '分');
	const triggerClass = $derived(size === 'sm' ? 'w-16 text-xs' : 'w-20');

	function update(next: string) {
		value = next;
		onValueChange?.(next);
	}

	// clearable のとき「指定なし」（空文字）を選ぶと時刻そのものを未指定に戻す
	function setHour(h: string) {
		update(h ? `${h}:${minute || '00'}` : '');
	}
	function setMinute(m: string) {
		update(m ? `${hour || '00'}:${m}` : '');
	}
</script>

<div class="flex items-center gap-2">
	{#if showIcon}
		<Clock
			class={size === 'sm'
				? 'size-3.5 shrink-0 text-muted-foreground'
				: 'size-4 text-muted-foreground'}
		/>
	{/if}
	<Select.Root type="single" value={hour} onValueChange={setHour}>
		<Select.Trigger {id} {size} class={triggerClass} aria-label={hourLabel}>
			{hour || '--'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				{#if clearable}
					<Select.Item value="">指定なし</Select.Item>
				{/if}
				{#each hours as h (h)}
					<Select.Item value={h} label={h}>{h}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	<span class="text-muted-foreground">:</span>
	<Select.Root type="single" value={minute} onValueChange={setMinute}>
		<Select.Trigger {size} class={triggerClass} aria-label={minuteLabel}>
			{minute || '--'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				{#if clearable}
					<Select.Item value="">指定なし</Select.Item>
				{/if}
				{#each minutes as m (m)}
					<Select.Item value={m} label={m}>{m}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
</div>
