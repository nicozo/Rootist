<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { Command as CommandPrimitive } from 'bits-ui';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { Component } from 'svelte';

	interface Suggestion {
		placeId: string;
		name: string;
		displayAddress: string;
	}

	let {
		id,
		placeholder,
		icon: Icon,
		onSelect
	}: {
		id?: string;
		placeholder: string;
		icon: Component;
		onSelect: (s: Suggestion) => void;
	} = $props();

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function searchPlaces(q: string): Promise<Suggestion[]> {
		const res = await fetch('/api/places', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: q })
		});
		const { suggestions: data } = await res.json();
		return data;
	}

	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			if (query.trim().length < 2) {
				suggestions = [];
				open = false;
				return;
			}
			loading = true;
			try {
				suggestions = await searchPlaces(query);
				open = suggestions.length > 0;
			} catch {
				suggestions = [];
				open = false;
			} finally {
				loading = false;
			}
		}, 350);
	}

	function handleSelect(s: Suggestion) {
		onSelect(s);
		query = '';
		suggestions = [];
		open = false;
	}
</script>

<Command.Root
	shouldFilter={false}
	class="relative h-auto w-full overflow-visible bg-transparent p-0"
>
	<div class="relative w-full">
		<Icon class="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
		<CommandPrimitive.Input
			{id}
			bind:value={query}
			oninput={handleInput}
			onblur={() => (open = false)}
			onkeydown={(e) => {
				if (e.key === 'Escape') open = false;
			}}
			{placeholder}
			autocomplete="off"
			class="w-full rounded-xl border border-primary/10 bg-card py-5 pr-10 pl-10 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
		/>
		{#if loading}
			<div class="absolute top-1/2 right-3 z-10 -translate-y-1/2">
				<Spinner class="text-primary" />
			</div>
		{/if}
	</div>

	{#if open && suggestions.length > 0}
		<Command.List
			onmousedown={(e) => e.preventDefault()}
			class="absolute top-full right-0 left-0 z-50 mt-1 rounded-xl border bg-popover text-popover-foreground shadow-lg"
		>
			<Command.Group>
				{#each suggestions as s (s.placeId)}
					<Command.Item value={s.placeId} onSelect={() => handleSelect(s)} class="cursor-pointer">
						<div class="flex min-w-0 flex-col gap-0.5">
							<span class="truncate text-sm font-medium text-primary">{s.name}</span>
							<span class="truncate text-xs text-muted-foreground">{s.displayAddress}</span>
						</div>
					</Command.Item>
				{/each}
			</Command.Group>
		</Command.List>
	{/if}
</Command.Root>
