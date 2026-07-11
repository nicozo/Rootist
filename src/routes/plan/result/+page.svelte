<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { routeResult } from '$lib/stores/route';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import {
		MapPin,
		Navigation,
		Clock,
		RotateCcw,
		ChevronDown,
		Home,
		TrainFront,
		Car,
		Footprints,
		Flag
	} from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	let result = $state($routeResult);

	onMount(() => {
		if (!result) goto(resolve('/plan'));
	});
</script>

{#if result}
	<div class="min-h-screen bg-background p-4 md:p-8">
		<div class="mx-auto max-w-2xl space-y-6">
			<header class="flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
				<div class="rounded-xl bg-primary p-2 shadow-lg">
					<Navigation class="h-6 w-6 text-accent" />
				</div>
				<div>
					<h1 class="text-2xl font-bold text-primary">生成されたルート</h1>
					<p class="text-xs font-medium text-muted-foreground">最適な訪問順序と1日のスケジュール</p>
				</div>
			</header>

			<div in:fly={{ y: 10, duration: 500, delay: 100 }}>
				<Card class="space-y-2 border-accent/20 bg-accent/10 p-4">
					{#if result.transportMode}
						<p class="flex items-center gap-1 text-xs font-medium text-accent">
							{#if result.transportMode === 'transit'}
								<TrainFront class="h-3 w-3" /> 電車・公共交通
							{:else if result.transportMode === 'car'}
								<Car class="h-3 w-3" /> 車
							{:else if result.transportMode === 'walking'}
								<Footprints class="h-3 w-3" /> 徒歩
							{/if}
						</p>
					{/if}
					<p class="text-sm leading-relaxed text-primary">{result.summary}</p>
				</Card>
			</div>

			<div class="space-y-2">
				{#if result.origin}
					<div in:fly={{ x: -10, duration: 400, delay: 150 }}>
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent"
								>
									<Home class="h-4 w-4" />
								</div>
								<div class="my-1 w-0.5 flex-1 bg-primary/20"></div>
								<ChevronDown class="h-4 w-4 text-primary/30" />
							</div>
							<Card class="mb-3 flex-1 border-accent/20 bg-accent/5 p-4 shadow-sm">
								<p class="mb-0.5 text-xs font-medium text-accent">出発地</p>
								<p class="font-semibold text-primary">{result.origin.name}</p>
								<p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
									<MapPin class="h-3 w-3 flex-shrink-0" />
									{result.origin.displayAddress}
								</p>
							</Card>
						</div>
					</div>
				{/if}

				{#each result.destinations as dest, i (dest.order)}
					<div in:fly={{ x: -10, duration: 400, delay: 150 + i * 80 }}>
						{#if dest.travelTimeFromPrevious}
							<div class="mb-2 ml-2 flex items-center gap-3">
								<div class="flex w-4 flex-col items-center">
									<div class="h-3 w-0.5 bg-primary/20"></div>
								</div>
								<div class="flex flex-col gap-0.5">
									<span class="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
										{dest.travelTimeFromPrevious}
									</span>
									{#if dest.transitRoute}
										<span class="ml-3 flex items-center gap-1 text-xs text-muted-foreground/70">
											<TrainFront class="h-3 w-3 flex-shrink-0" />
											{dest.transitRoute}
										</span>
									{/if}
								</div>
							</div>
						{/if}
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-background"
								>
									{dest.order}
								</div>
								{#if i < result.destinations.length - 1 || result.endDestination}
									<div class="my-1 w-0.5 flex-1 bg-primary/20"></div>
									<ChevronDown class="h-4 w-4 text-primary/30" />
								{/if}
							</div>

							<Card class="mb-3 flex-1 border-primary/5 bg-card/80 p-4 shadow-sm">
								<div class="space-y-2">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="font-semibold text-primary">{dest.name}</p>
											<p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
												<MapPin class="h-3 w-3 flex-shrink-0" />
												{dest.displayAddress}
											</p>
										</div>
										<div class="flex-shrink-0 text-right">
											<p
												class="flex items-center justify-end gap-1 text-xs font-medium text-accent"
											>
												<Clock class="h-3 w-3" />
												{dest.arrivalTime} - {dest.departureTime}
											</p>
										</div>
									</div>
									<p
										class="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground"
									>
										{dest.description}
									</p>
								</div>
							</Card>
						</div>
					</div>
				{/each}

				{#if result.endDestination}
					<div in:fly={{ x: -10, duration: 400, delay: 150 + result.destinations.length * 80 }}>
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"
								>
									<Flag class="h-4 w-4" />
								</div>
							</div>
							<Card class="mb-3 flex-1 border-primary/10 bg-card/80 p-4 shadow-sm">
								<p class="mb-0.5 text-xs font-medium text-muted-foreground">終点</p>
								<p class="font-semibold text-primary">{result.endDestination.name}</p>
								<p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
									<MapPin class="h-3 w-3 flex-shrink-0" />
									{result.endDestination.displayAddress}
								</p>
							</Card>
						</div>
					</div>
				{/if}
			</div>

			<div in:fade={{ duration: 400, delay: 300 }}>
				<Button
					onclick={() => goto(resolve('/plan'))}
					variant="outline"
					class="w-full border-primary/20 text-primary hover:bg-primary/5"
				>
					<RotateCcw class="mr-2 h-4 w-4" />
					もう一度計画する
				</Button>
			</div>
		</div>
	</div>
{/if}
