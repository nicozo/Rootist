<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { Command as CommandPrimitive } from 'bits-ui';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { Component } from 'svelte';
	import type { LatLng } from '$lib/stores/route';

	interface Suggestion {
		placeId: string;
		name: string;
		displayAddress: string;
	}

	let {
		id,
		label,
		placeholder,
		icon: Icon,
		onSelect
	}: {
		id?: string;
		label: string;
		placeholder: string;
		icon: Component;
		onSelect: (s: Suggestion & { location: LatLng }) => void;
	} = $props();

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let loading = $state(false);
	let open = $state(false);
	// 選んだ候補の座標を取得中か
	let resolving = $state(false);
	let selectError = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	// 候補検索〜1件選択までを1セッションとして同じトークンで呼ぶ（Autocomplete の課金をまとめるため。issue #149）
	let sessionToken = crypto.randomUUID();

	async function searchPlaces(q: string): Promise<Suggestion[]> {
		const res = await fetch('/api/places', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: q, sessionToken })
		});
		const { suggestions: data } = await res.json();
		return data;
	}

	function handleInput() {
		selectError = null;
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

	async function fetchLocation(placeId: string): Promise<LatLng> {
		const res = await fetch('/api/places/details', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ placeId, sessionToken })
		});
		if (!res.ok) throw new Error(`details ${res.status}`);
		const { location } = await res.json();
		return location;
	}

	async function handleSelect(s: Suggestion) {
		if (resolving) return;
		open = false;
		resolving = true;
		selectError = null;
		const queryAtSelect = query;
		try {
			const location = await fetchLocation(s.placeId);
			onSelect({ ...s, location });
			// 座標の取得中に次の入力が始まっていたら、その入力は消さない
			if (query === queryAtSelect) {
				query = '';
				suggestions = [];
			}
		} catch {
			selectError = '場所の位置情報を取得できませんでした。もう一度選んでください。';
		} finally {
			resolving = false;
			sessionToken = crypto.randomUUID();
		}
	}
</script>

<Command.Root
	{label}
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
		{#if loading || resolving}
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
	{#if selectError}
		<p role="alert" class="mt-1 text-xs text-destructive">{selectError}</p>
	{/if}
</Command.Root>
