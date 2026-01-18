<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Card } from "$lib/components/ui/card";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Badge } from "$lib/components/ui/badge";
	import { Pin, Navigation, Trash2, Sparkles } from '@lucide/svelte';

	// Svelte 5 の状態管理
	let locations = $state<{ id: string; name: string }[]>([]);
	let newLocation = $state("");

	function addLocation() {
		if (newLocation.trim()) {
			locations.push({
				id: crypto.randomUUID(),
				name: newLocation.trim()
			});
			newLocation = "";
		}
	}

	function removeLocation(id: string) {
		locations = locations.filter((loc) => loc.id !== id);
	}

	function optimizeRoute() {
		// ここで Gemini API を呼び出す（後ほど実装）
		console.log("Geminiで最適化開始:", $state.snapshot(locations));
	}
</script>

<div class="flex h-screen bg-background text-foreground">
	<aside class="w-80 border-r border-border flex flex-col bg-card">
		<div class="p-6 border-b border-border bg-primary text-primary-foreground">
			<h1 class="text-2xl font-bold flex items-center gap-2">
				<Navigation class="w-6 h-6" />
				Rootist
			</h1>
			<p class="text-xs opacity-80 mt-1">AIが導く、あなただけの旅路</p>
		</div>

		<div class="p-4 space-y-4">
			<div class="flex gap-2">
				<Input
					placeholder="どこへ行きますか？"
					bind:value={newLocation}
					onkeydown={(e) => e.key === 'Enter' && addLocation()}
				/>
				<Button onclick={addLocation} size="icon" variant="secondary">
					<Pin class="w-4 h-4" />
				</Button>
			</div>

			<ScrollArea class="h-[calc(100vh-280px)] pr-4">
				<div class="space-y-3">
					{#each locations as loc, i (loc.id)}
						<Card class="p-3 flex items-center justify-between group transition-all hover:border-accent">
							<div class="flex items-center gap-3">
								<Badge variant="outline" class="bg-muted text-primary font-bold">
									{i + 1}
								</Badge>
								<span class="text-sm font-medium">{loc.name}</span>
							</div>
							<button 
								onclick={() => removeLocation(loc.id)}
								class="text-muted-foreground hover:text-destructive transition-colors"
							>
								<Trash2 class="w-4 h-4" />
							</button>
						</Card>
					{/each}
				</div>
			</ScrollArea>
		</div>

		<div class="mt-auto p-4 border-t border-border bg-muted/30">
			<Button 
				onclick={optimizeRoute} 
				class="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-6 shadow-lg transition-transform active:scale-95"
				disabled={locations.length < 2}
			>
				<Sparkles class="w-4 h-4 mr-2" />
				Geminiでルートを最適化
			</Button>
		</div>
	</aside>

	<main class="flex-1 relative bg-muted/20 flex items-center justify-center">
		<div class="text-center space-y-2 text-muted-foreground">
			<Pin class="w-12 h-12 mx-auto opacity-20" />
			<p>地図を表示するには、地点を追加して最適化してください</p>
		</div>
	</main>
</div>
