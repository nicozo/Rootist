<script lang="ts">
	import { goto } from "$app/navigation";
	import { routeResult } from "$lib/stores/route";
	import { Button } from "$lib/components/ui/button";
	import { Card } from "$lib/components/ui/card";
	import { MapPin, Navigation, Clock, RotateCcw, ChevronDown, Home } from "@lucide/svelte";
	import { fly, fade } from "svelte/transition";
	import { onMount } from "svelte";

	let result = $state($routeResult);

	onMount(() => {
		if (!result) goto("/plan");
	});
</script>

{#if result}
	<div class="min-h-screen bg-background p-4 md:p-8">
		<div class="max-w-2xl mx-auto space-y-6">
			<header class="flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
				<div class="bg-primary p-2 rounded-xl shadow-lg">
					<Navigation class="w-6 h-6 text-accent" />
				</div>
				<div>
					<h1 class="text-2xl font-bold text-primary">生成されたルート</h1>
					<p class="text-xs text-muted-foreground font-medium">最適な訪問順序と1日のスケジュール</p>
				</div>
			</header>

			<div in:fly={{ y: 10, duration: 500, delay: 100 }}>
				<Card class="p-4 bg-accent/10 border-accent/20">
					<p class="text-sm text-primary leading-relaxed">{result.summary}</p>
				</Card>
			</div>

			<div class="space-y-2">
				{#if result.origin}
					<div in:fly={{ x: -10, duration: 400, delay: 150 }}>
						<div class="flex gap-3 items-stretch">
							<div class="flex flex-col items-center">
								<div class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 text-accent">
									<Home class="w-4 h-4" />
								</div>
								<div class="w-0.5 flex-1 bg-primary/20 my-1"></div>
								<ChevronDown class="w-4 h-4 text-primary/30" />
							</div>
							<Card class="flex-1 p-4 mb-3 shadow-sm border-accent/20 bg-accent/5">
								<p class="text-xs font-medium text-accent mb-0.5">出発地</p>
								<p class="font-semibold text-primary">{result.origin.name}</p>
								<p class="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
									<MapPin class="w-3 h-3 flex-shrink-0" />
									{result.origin.displayAddress}
								</p>
							</Card>
						</div>
					</div>
				{/if}

				{#each result.destinations as dest, i (dest.order)}
					<div in:fly={{ x: -10, duration: 400, delay: 150 + i * 80 }}>
						<div class="flex gap-3 items-stretch">
							<div class="flex flex-col items-center">
								<div class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-background text-sm font-black">
									{dest.order}
								</div>
								{#if i < result.destinations.length - 1}
									<div class="w-0.5 flex-1 bg-primary/20 my-1"></div>
									<ChevronDown class="w-4 h-4 text-primary/30" />
								{/if}
							</div>

							<Card class="flex-1 p-4 mb-3 shadow-sm border-primary/5 bg-card/80">
								<div class="space-y-2">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="font-semibold text-primary">{dest.name}</p>
											<p class="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
												<MapPin class="w-3 h-3 flex-shrink-0" />
												{dest.displayAddress}
											</p>
										</div>
										<div class="flex-shrink-0 text-right">
											<p class="text-xs font-medium text-accent flex items-center gap-1 justify-end">
												<Clock class="w-3 h-3" />
												{dest.arrivalTime} - {dest.departureTime}
											</p>
										</div>
									</div>
									<p class="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
										{dest.description}
									</p>
								</div>
							</Card>
						</div>
					</div>
				{/each}
			</div>

			<div in:fade={{ duration: 400, delay: 300 }}>
				<Button
					onclick={() => goto("/plan")}
					variant="outline"
					class="w-full border-primary/20 text-primary hover:bg-primary/5"
				>
					<RotateCcw class="w-4 h-4 mr-2" />
					もう一度計画する
				</Button>
			</div>
		</div>
	</div>
{/if}
