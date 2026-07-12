<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { Clock } from '@lucide/svelte';

	// 値は "HH:MM" 文字列（未選択は ""）。既存 startTime 契約を維持。
	let { value = $bindable(''), id }: { value?: string; id?: string } = $props();

	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = ['00', '15', '30', '45'];

	const hour = $derived(value ? value.split(':')[0] : '');
	const minute = $derived(value ? value.split(':')[1] : '');

	function setHour(h: string) {
		value = `${h}:${minute || '00'}`;
	}
	function setMinute(m: string) {
		value = `${hour || '00'}:${m}`;
	}
</script>

<div class="flex items-center gap-2">
	<Clock class="size-4 text-muted-foreground" />
	<Select.Root type="single" value={hour} onValueChange={setHour}>
		<Select.Trigger {id} class="w-20" aria-label="時">
			{hour || '--'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				{#each hours as h (h)}
					<Select.Item value={h} label={h}>{h}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	<span class="text-muted-foreground">:</span>
	<Select.Root type="single" value={minute} onValueChange={setMinute}>
		<Select.Trigger class="w-20" aria-label="分">
			{minute || '--'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				{#each minutes as m (m)}
					<Select.Item value={m} label={m}>{m}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
</div>
