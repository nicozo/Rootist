<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { MapPin, Navigation, Trash2, Sparkles, Home, X, ChevronDown, Flag } from '@lucide/svelte';
	import { fly, slide } from 'svelte/transition';
	import { routeResult } from '$lib/stores/route';

	interface Suggestion {
		placeId: string;
		name: string;
		displayAddress: string;
	}

	// 詳細設定の開閉
	let isDetailsOpen = $state(false);

	// 移動手段
	type TransportMode = 'transit' | 'car' | 'walking' | '';
	const transportOptions: { value: TransportMode; label: string }[] = [
		{ value: '', label: '未選択' },
		{ value: 'transit', label: '電車・公共交通' },
		{ value: 'car', label: '車' },
		{ value: 'walking', label: '徒歩' }
	];
	let transportMode = $state<TransportMode>('');

	// 出発地
	let origin = $state<{ name: string; displayAddress: string } | null>(null);
	let originInput = $state('');
	let originSuggestions = $state<Suggestion[]>([]);
	let isOriginLoading = $state(false);
	let isOriginOpen = $state(false);
	let originActiveIndex = $state(-1);
	let originDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// 開始時間
	let startTime = $state('');

	// 終点
	let endDestination = $state<{ name: string; displayAddress: string } | null>(null);
	let endDestinationInput = $state('');
	let endDestinationSuggestions = $state<Suggestion[]>([]);
	let isEndDestinationLoading = $state(false);
	let isEndDestinationOpen = $state(false);
	let endDestinationActiveIndex = $state(-1);
	let endDestinationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// 目的地リスト
	let locations = $state<{ id: string; address: string; displayAddress?: string }[]>([]);
	let currentAddress = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let isLoading = $state(false);
	let isOpen = $state(false);
	let activeIndex = $state(-1);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let isGenerating = $state(false);
	let generateError = $state<string | null>(null);

	async function searchPlaces(query: string): Promise<Suggestion[]> {
		const res = await fetch('/api/places', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query })
		});
		const { suggestions: data } = await res.json();
		return data;
	}

	// 出発地
	function handleOriginInput() {
		if (originDebounceTimer) clearTimeout(originDebounceTimer);
		originDebounceTimer = setTimeout(async () => {
			if (originInput.trim().length < 2) {
				originSuggestions = [];
				isOriginOpen = false;
				return;
			}
			isOriginLoading = true;
			try {
				originSuggestions = await searchPlaces(originInput);
				isOriginOpen = originSuggestions.length > 0;
				originActiveIndex = -1;
			} catch {
				originSuggestions = [];
				isOriginOpen = false;
			} finally {
				isOriginLoading = false;
			}
		}, 350);
	}

	function selectOriginSuggestion(suggestion: Suggestion) {
		origin = { name: suggestion.name, displayAddress: suggestion.displayAddress };
		originInput = '';
		originSuggestions = [];
		isOriginOpen = false;
		originActiveIndex = -1;
	}

	function handleOriginKeydown(e: KeyboardEvent) {
		if (!isOriginOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			originActiveIndex = Math.min(originActiveIndex + 1, originSuggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			originActiveIndex = Math.max(originActiveIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (originActiveIndex >= 0) selectOriginSuggestion(originSuggestions[originActiveIndex]);
		} else if (e.key === 'Escape') {
			isOriginOpen = false;
			originActiveIndex = -1;
		}
	}

	// 終点
	function handleEndDestinationInput() {
		if (endDestinationDebounceTimer) clearTimeout(endDestinationDebounceTimer);
		endDestinationDebounceTimer = setTimeout(async () => {
			if (endDestinationInput.trim().length < 2) {
				endDestinationSuggestions = [];
				isEndDestinationOpen = false;
				return;
			}
			isEndDestinationLoading = true;
			try {
				endDestinationSuggestions = await searchPlaces(endDestinationInput);
				isEndDestinationOpen = endDestinationSuggestions.length > 0;
				endDestinationActiveIndex = -1;
			} catch {
				endDestinationSuggestions = [];
				isEndDestinationOpen = false;
			} finally {
				isEndDestinationLoading = false;
			}
		}, 350);
	}

	function selectEndDestinationSuggestion(suggestion: Suggestion) {
		endDestination = { name: suggestion.name, displayAddress: suggestion.displayAddress };
		endDestinationInput = '';
		endDestinationSuggestions = [];
		isEndDestinationOpen = false;
		endDestinationActiveIndex = -1;
	}

	function handleEndDestinationKeydown(e: KeyboardEvent) {
		if (!isEndDestinationOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			endDestinationActiveIndex = Math.min(
				endDestinationActiveIndex + 1,
				endDestinationSuggestions.length - 1
			);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			endDestinationActiveIndex = Math.max(endDestinationActiveIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (endDestinationActiveIndex >= 0)
				selectEndDestinationSuggestion(endDestinationSuggestions[endDestinationActiveIndex]);
		} else if (e.key === 'Escape') {
			isEndDestinationOpen = false;
			endDestinationActiveIndex = -1;
		}
	}

	// 目的地
	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			if (currentAddress.trim().length < 2) {
				suggestions = [];
				isOpen = false;
				return;
			}
			isLoading = true;
			try {
				suggestions = await searchPlaces(currentAddress);
				isOpen = suggestions.length > 0;
				activeIndex = -1;
			} catch {
				suggestions = [];
				isOpen = false;
			} finally {
				isLoading = false;
			}
		}, 350);
	}

	function selectSuggestion(suggestion: Suggestion) {
		locations.push({
			id: crypto.randomUUID(),
			address: suggestion.name,
			displayAddress: suggestion.displayAddress
		});
		currentAddress = '';
		suggestions = [];
		isOpen = false;
		activeIndex = -1;
	}

	function removeLocation(id: string) {
		locations = locations.filter((loc) => loc.id !== id);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex]);
		} else if (e.key === 'Escape') {
			isOpen = false;
			activeIndex = -1;
		}
	}

	async function generateRoute() {
		isGenerating = true;
		generateError = null;
		try {
			const res = await fetch('/api/route', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					origin: origin ?? undefined,
					transportMode: transportMode || undefined,
					startTime: startTime || undefined,
					endDestination: endDestination ?? undefined,
					locations: locations.map((l) => ({
						name: l.address,
						displayAddress: l.displayAddress ?? ''
					}))
				})
			});
			if (!res.ok) {
				generateError = 'ルート生成に失敗しました。もう一度お試しください。';
				return;
			}
			const data = await res.json();
			routeResult.set(data);
			goto(resolve('/plan/result'));
		} catch {
			generateError = '通信エラーが発生しました。もう一度お試しください。';
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="min-h-screen bg-background p-4 md:p-8">
	<div class="mx-auto max-w-2xl space-y-8">
		<header class="mb-8 flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
			<div class="rounded-xl bg-primary p-2 shadow-lg">
				<Navigation class="h-6 w-6 text-accent" />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-primary">ルート作成</h1>
				<p class="text-xs font-medium text-muted-foreground">行きたい場所を入力してください</p>
			</div>
		</header>

		<!-- 出発地（任意） -->
		<section class="space-y-2">
			<div class="ml-1">
				<p class="text-xs font-semibold text-muted-foreground">出発地（任意）</p>
				<p class="mt-0.5 text-xs text-muted-foreground">
					設定すると出発地からの移動を含めたプランを作成します
				</p>
			</div>
			{#if origin}
				<div in:fly={{ x: -10, duration: 300 }}>
					<Card class="border-accent/20 bg-accent/5 p-3 shadow-sm">
						<div class="flex items-center justify-between gap-4">
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent"
								>
									<Home class="h-3 w-3" />
								</div>
								<div class="flex min-w-0 flex-col">
									<span class="text-sm font-medium break-words">{origin.name}</span>
									<span class="text-xs break-words text-muted-foreground"
										>{origin.displayAddress}</span
									>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => {
									origin = null;
								}}
								class="h-8 w-8 flex-shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					</Card>
				</div>
			{:else}
				<div class="relative w-full">
					<Home
						class="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					{#if isOriginLoading}
						<div class="absolute top-1/2 right-3 z-10 -translate-y-1/2">
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
							></div>
						</div>
					{/if}
					<Input
						placeholder="例：自宅最寄り駅、宿泊ホテル..."
						bind:value={originInput}
						oninput={handleOriginInput}
						onkeydown={handleOriginKeydown}
						onblur={() => {
							isOriginOpen = false;
							originActiveIndex = -1;
						}}
						autocomplete="off"
						class="rounded-xl border-primary/10 bg-card py-5 pl-10 shadow-sm focus-visible:ring-accent"
					/>
					{#if isOriginOpen && originSuggestions.length > 0}
						<div
							onmousedown={(e) => e.preventDefault()}
							class="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
							in:fly={{ y: -4, duration: 150 }}
						>
							{#each originSuggestions as suggestion, i (suggestion.placeId)}
								<button
									type="button"
									onclick={() => selectOriginSuggestion(suggestion)}
									class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors {originActiveIndex ===
									i
										? 'bg-accent/50'
										: 'hover:bg-muted/50'}"
								>
									<span class="truncate text-sm font-medium text-primary">{suggestion.name}</span>
									<span class="truncate text-xs text-muted-foreground"
										>{suggestion.displayAddress}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- 目的地追加（メイン） -->
		<section class="space-y-4">
			<div class="grid gap-2">
				<label for="address" class="ml-1 text-sm font-bold text-primary">目的地を追加</label>
				<p class="ml-1 text-xs text-muted-foreground">同じ都道府県内のスポットを入力してください</p>
				<div class="relative w-full">
					<MapPin
						class="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					{#if isLoading}
						<div class="absolute top-1/2 right-3 z-10 -translate-y-1/2">
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
							></div>
						</div>
					{/if}
					<Input
						id="address"
						placeholder="例：東京タワー、浅草寺..."
						bind:value={currentAddress}
						oninput={handleInput}
						onkeydown={handleKeydown}
						onblur={() => {
							isOpen = false;
							activeIndex = -1;
						}}
						autocomplete="off"
						class="rounded-xl border-primary/10 bg-card py-6 pl-10 shadow-sm focus-visible:ring-accent"
					/>
					{#if isOpen && suggestions.length > 0}
						<div
							onmousedown={(e) => e.preventDefault()}
							class="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
							in:fly={{ y: -4, duration: 150 }}
						>
							{#each suggestions as suggestion, i (suggestion.placeId)}
								<button
									type="button"
									onclick={() => selectSuggestion(suggestion)}
									class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors {activeIndex ===
									i
										? 'bg-accent/50'
										: 'hover:bg-muted/50'}"
								>
									<span class="truncate text-sm font-medium text-primary">{suggestion.name}</span>
									<span class="truncate text-xs text-muted-foreground"
										>{suggestion.displayAddress}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- 目的地リスト -->
		<section class="space-y-3">
			<div class="ml-1 flex items-center justify-between">
				<h2 class="text-sm font-bold text-primary">目的地リスト</h2>
				<Badge variant="outline" class="border-primary/20 text-[10px] text-primary">
					{locations.length} 箇所
				</Badge>
			</div>

			{#if locations.length === 0}
				<Card
					class="flex flex-col items-center justify-center border-2 border-dashed bg-transparent p-8 text-muted-foreground"
				>
					<MapPin class="mb-2 h-8 w-8 opacity-20" />
					<p class="text-xs">まだ目的地がありません</p>
				</Card>
			{:else}
				<div class="grid gap-3">
					{#each locations as loc, i (loc.id)}
						<div in:fly={{ x: -10, duration: 400 }} out:slide>
							<Card
								class="border-primary/5 bg-card/80 p-3 shadow-sm backdrop-blur-sm transition-colors hover:border-accent/50"
							>
								<div class="flex w-full flex-row items-center justify-between gap-4">
									<div class="flex min-w-0 items-center gap-3">
										<div
											class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary"
										>
											{i + 1}
										</div>
										<div class="flex min-w-0 flex-col">
											<span class="text-sm font-medium break-words">{loc.address}</span>
											{#if loc.displayAddress}
												<span class="text-xs break-words text-muted-foreground"
													>{loc.displayAddress}</span
												>
											{/if}
										</div>
									</div>
									<Button
										variant="ghost"
										size="icon"
										onclick={() => removeLocation(loc.id)}
										class="h-8 w-8 flex-shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</Card>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- 詳細設定（折りたたみ） -->
		<section class="space-y-3">
			<button
				type="button"
				onclick={() => {
					isDetailsOpen = !isDetailsOpen;
				}}
				class="ml-1 flex w-full items-center gap-2 text-left text-sm font-bold text-primary"
			>
				<ChevronDown
					class="h-4 w-4 transition-transform duration-200 {isDetailsOpen ? 'rotate-180' : ''}"
				/>
				詳細設定（任意）
			</button>

			{#if isDetailsOpen}
				<div class="space-y-6" in:slide={{ duration: 200 }}>
					<!-- 移動手段 -->
					<div class="space-y-2">
						<label for="transport" class="ml-1 text-xs font-semibold text-muted-foreground"
							>移動手段</label
						>
						<select
							id="transport"
							bind:value={transportMode}
							class="h-9 w-full rounded-xl border border-primary/10 bg-card px-3 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-accent focus:outline-none"
						>
							{#each transportOptions as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>

					<!-- 開始時間 -->
					<div class="space-y-2">
						<label for="startTime" class="ml-1 text-xs font-semibold text-muted-foreground"
							>開始時間</label
						>
						<input
							id="startTime"
							type="time"
							bind:value={startTime}
							class="h-9 w-full rounded-xl border border-primary/10 bg-card px-3 text-sm text-foreground shadow-sm focus:ring-2 focus:ring-accent focus:outline-none"
						/>
					</div>

					<!-- 終点 -->
					<div class="space-y-2">
						<p class="ml-1 text-xs font-semibold text-muted-foreground">終点（宿泊先など）</p>
						{#if endDestination}
							<div in:fly={{ x: -10, duration: 300 }}>
								<Card class="border-primary/10 bg-card p-3 shadow-sm">
									<div class="flex items-center justify-between gap-4">
										<div class="flex min-w-0 items-center gap-3">
											<div
												class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
											>
												<Flag class="h-3 w-3" />
											</div>
											<div class="flex min-w-0 flex-col">
												<span class="text-sm font-medium break-words">{endDestination.name}</span>
												<span class="text-xs break-words text-muted-foreground"
													>{endDestination.displayAddress}</span
												>
											</div>
										</div>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => {
												endDestination = null;
											}}
											class="h-8 w-8 flex-shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										>
											<X class="h-4 w-4" />
										</Button>
									</div>
								</Card>
							</div>
						{:else}
							<div class="relative w-full">
								<Flag
									class="absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
								/>
								{#if isEndDestinationLoading}
									<div class="absolute top-1/2 right-3 z-10 -translate-y-1/2">
										<div
											class="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
										></div>
									</div>
								{/if}
								<Input
									placeholder="例：新宿グランドホテル..."
									bind:value={endDestinationInput}
									oninput={handleEndDestinationInput}
									onkeydown={handleEndDestinationKeydown}
									onblur={() => {
										isEndDestinationOpen = false;
										endDestinationActiveIndex = -1;
									}}
									autocomplete="off"
									class="rounded-xl border-primary/10 bg-card py-5 pl-10 shadow-sm focus-visible:ring-accent"
								/>
								{#if isEndDestinationOpen && endDestinationSuggestions.length > 0}
									<div
										onmousedown={(e) => e.preventDefault()}
										class="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
										in:fly={{ y: -4, duration: 150 }}
									>
										{#each endDestinationSuggestions as suggestion, i (suggestion.placeId)}
											<button
												type="button"
												onclick={() => selectEndDestinationSuggestion(suggestion)}
												class="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors {endDestinationActiveIndex ===
												i
													? 'bg-accent/50'
													: 'hover:bg-muted/50'}"
											>
												<span class="truncate text-sm font-medium text-primary"
													>{suggestion.name}</span
												>
												<span class="truncate text-xs text-muted-foreground"
													>{suggestion.displayAddress}</span
												>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		{#if locations.length >= 2}
			<div class="pt-4" in:fly={{ y: 20, duration: 600 }}>
				<Button
					onclick={generateRoute}
					disabled={isGenerating}
					class="group w-full rounded-2xl bg-accent py-8 text-lg font-bold text-accent-foreground shadow-xl shadow-accent/20 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
				>
					{#if isGenerating}
						<div
							class="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground"
						></div>
						生成中...
					{:else}
						<Sparkles class="mr-2 h-5 w-5 animate-pulse" />
						最短ルートを自動生成する
						<Navigation
							class="ml-2 h-4 w-4 rotate-90 transition-transform group-hover:translate-x-1"
						/>
					{/if}
				</Button>
				{#if generateError}
					<p class="mt-2 text-center text-xs text-destructive">{generateError}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
