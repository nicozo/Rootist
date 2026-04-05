<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card } from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { MapPin, Navigation, Trash2, Sparkles } from "@lucide/svelte";
	import { fly, slide } from "svelte/transition";

	interface Suggestion {
		placeId: string;
		name: string;
		displayAddress: string;
	}

	// 目的地のリスト状態管理
	let locations = $state<{ id: string; address: string; displayAddress?: string }[]>([]);
	let currentAddress = $state("");
	let suggestions = $state<Suggestion[]>([]);
	let isLoading = $state(false);
	let isOpen = $state(false);
	let activeIndex = $state(-1);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function searchAddress(query: string) {
		if (query.trim().length < 2) {
			suggestions = [];
			isOpen = false;
			return;
		}
		isLoading = true;
		try {
			const res = await fetch("/api/places", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query })
			});
			const { suggestions: data } = await res.json();
			suggestions = data;
			isOpen = suggestions.length > 0;
			activeIndex = -1;
		} catch {
			suggestions = [];
			isOpen = false;
		} finally {
			isLoading = false;
		}
	}

	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			searchAddress(currentAddress);
		}, 350);
	}

	function selectSuggestion(suggestion: Suggestion) {
		locations.push({
			id: crypto.randomUUID(),
			address: suggestion.name,
			displayAddress: suggestion.displayAddress
		});
		currentAddress = "";
		suggestions = [];
		isOpen = false;
		activeIndex = -1;
	}

	function addLocation() {
		if (currentAddress.trim()) {
			locations.push({
				id: crypto.randomUUID(),
				address: currentAddress.trim()
			});
			currentAddress = "";
			suggestions = [];
			isOpen = false;
			activeIndex = -1;
		}
	}

	function removeLocation(id: string) {
		locations = locations.filter(loc => loc.id !== id);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
				break;
			case "ArrowUp":
				e.preventDefault();
				activeIndex = Math.max(activeIndex - 1, -1);
				break;
			case "Enter":
				e.preventDefault();
				if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex]);
				break;
			case "Escape":
				isOpen = false;
				activeIndex = -1;
				break;
		}
	}
</script>

<div class="min-h-screen bg-background p-4 md:p-8">
	<div class="max-w-2xl mx-auto space-y-8">
		<header class="flex items-center gap-3 mb-8" in:fly={{ y: -10, duration: 600 }}>
			<div class="bg-primary p-2 rounded-xl shadow-lg">
				<Navigation class="w-6 h-6 text-accent" />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-primary">ルート作成</h1>
				<p class="text-xs text-muted-foreground font-medium">行きたい場所を入力してください</p>
			</div>
		</header>

		<section class="space-y-4">
			<div class="grid gap-2">
				<Label for="address" class="text-sm font-bold text-primary ml-1">目的地を追加</Label>
				<div class="flex gap-2">
					<div class="relative w-full">
						<MapPin class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
						{#if isLoading}
							<div class="absolute right-3 top-1/2 -translate-y-1/2 z-10">
								<div class="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin"></div>
							</div>
						{/if}
						<Input
							id="address"
							placeholder="例：東京タワー、京都市中京区..."
							bind:value={currentAddress}
							oninput={handleInput}
							onkeydown={handleKeydown}
							onblur={() => { isOpen = false; activeIndex = -1; }}
							autocomplete="off"
							class="pl-10 py-6 border-primary/10 focus-visible:ring-accent rounded-xl bg-card shadow-sm"
						/>

						{#if isOpen && suggestions.length > 0}
							<div
								onmousedown={(e) => e.preventDefault()}
								class="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden"
								in:fly={{ y: -4, duration: 150 }}
							>
								{#each suggestions as suggestion, i (suggestion.placeId)}
									<button
										type="button"
										onclick={() => selectSuggestion(suggestion)}
										class="w-full text-left px-4 py-3 transition-colors flex flex-col gap-0.5 {activeIndex === i ? 'bg-accent/50' : 'hover:bg-muted/50'}"
									>
										<span class="text-sm font-medium text-primary truncate">{suggestion.name}</span>
										<span class="text-xs text-muted-foreground truncate">{suggestion.displayAddress}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<section class="space-y-3">
			<div class="flex items-center justify-between ml-1">
				<h2 class="text-sm font-bold text-primary">目的地リスト</h2>
				<Badge variant="outline" class="text-[10px] border-primary/20 text-primary">
					{locations.length} 箇所
				</Badge>
			</div>

			{#if locations.length === 0}
				<Card class="p-8 border-dashed border-2 flex flex-col items-center justify-center text-muted-foreground bg-transparent">
					<MapPin class="w-8 h-8 mb-2 opacity-20" />
					<p class="text-xs">まだ目的地がありません</p>
				</Card>
			{:else}
				<div class="grid gap-3">
					{#each locations as loc, i (loc.id)}
						<div in:fly={{ x: -10, duration: 400 }} out:slide>
							<Card class="p-3 shadow-sm border-primary/5 hover:border-accent/50 transition-colors bg-card/80 backdrop-blur-sm">
								<div class="flex flex-row items-center justify-between w-full gap-4">
									<div class="flex items-center gap-3 min-w-0">
										<div class="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-black">
											{i + 1}
										</div>
										<div class="flex flex-col min-w-0">
											<span class="text-sm font-medium break-words">{loc.address}</span>
											{#if loc.displayAddress}
												<span class="text-xs text-muted-foreground break-words">{loc.displayAddress}</span>
											{/if}
										</div>
									</div>

									<Button
										variant="ghost"
										size="icon"
										onclick={() => removeLocation(loc.id)}
										class="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
									>
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							</Card>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if locations.length >= 2}
			<div class="pt-4" in:fly={{ y: 20, duration: 600 }}>
				<Button class="w-full bg-accent hover:bg-accent/90 text-accent-foreground py-8 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 group">
					<Sparkles class="w-5 h-5 mr-2 animate-pulse" />
					最短ルートを自動生成する
					<Navigation class="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform rotate-90" />
				</Button>
			</div>
		{/if}
	</div>
</div>
