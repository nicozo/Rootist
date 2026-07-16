<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { routeResult } from '$lib/stores/route';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
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

	const timeSlotLabels: Record<string, string> = {
		morning: '朝',
		noon: '昼',
		night: '晩'
	};

	let result = $state($routeResult);

	onMount(() => {
		if (!result) goto(resolve('/plan'));
	});
</script>

{#if result}
	<div class="min-h-screen bg-background p-4 md:p-8">
		<div class="mx-auto flex max-w-2xl flex-col gap-6">
			<header class="flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
				<div class="rounded-xl bg-primary p-2 shadow-lg">
					<Navigation class="size-6 text-accent" />
				</div>
				<div>
					<h1 class="text-2xl font-bold text-primary">あなたの1日プラン</h1>
					<p class="text-xs font-medium text-muted-foreground">最適な訪問順序と1日のスケジュール</p>
				</div>
			</header>

			<div in:fly={{ y: 10, duration: 500, delay: 100 }}>
				<Card.Root class="border-accent/20 bg-accent/10">
					<Card.Content class="flex flex-col gap-2">
						{#if result.transportMode}
							<p class="flex items-center gap-1 text-xs font-medium text-accent">
								{#if result.transportMode === 'transit'}
									<TrainFront class="size-3" /> 電車・公共交通
								{:else if result.transportMode === 'car'}
									<Car class="size-3" /> 車
								{:else if result.transportMode === 'walking'}
									<Footprints class="size-3" /> 徒歩
								{/if}
							</p>
						{/if}
						<p class="text-sm leading-relaxed text-primary">{result.summary}</p>
					</Card.Content>
				</Card.Root>
			</div>

			<div class="flex flex-col gap-2">
				{#if result.origin}
					<div in:fly={{ x: -10, duration: 400, delay: 150 }}>
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent"
								>
									<Home class="size-4" />
								</div>
								<div class="my-1 w-0.5 flex-1 bg-primary/20"></div>
								<ChevronDown class="size-4 text-primary/30" />
							</div>
							<Card.Root class="mb-3 flex-1 border-accent/20 bg-accent/5">
								<Card.Header>
									<Card.Description class="text-accent">出発地</Card.Description>
									<Card.Title class="text-primary">{result.origin.name}</Card.Title>
									<Card.Description class="flex items-center gap-1">
										<MapPin class="size-3 shrink-0" />
										{result.origin.displayAddress}
									</Card.Description>
								</Card.Header>
							</Card.Root>
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
											<TrainFront class="size-3 shrink-0" />
											{dest.transitRoute}
										</span>
									{/if}
								</div>
							</div>
						{/if}
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-background"
								>
									{dest.order}
								</div>
								{#if i < result.destinations.length - 1 || result.endDestination}
									<div class="my-1 w-0.5 flex-1 bg-primary/20"></div>
									<ChevronDown class="size-4 text-primary/30" />
								{/if}
							</div>

							<Card.Root class="mb-3 flex-1 border-primary/5 bg-card/80">
								<Card.Header>
									<Card.Title class="text-primary">{dest.name}</Card.Title>
									<Card.Description class="flex items-center gap-1">
										<MapPin class="size-3 shrink-0" />
										{dest.displayAddress}
									</Card.Description>
									<Card.Action>
										<div class="flex flex-col items-end gap-1">
											<p class="flex items-center gap-1 text-xs font-medium text-accent">
												<Clock class="size-3" />
												{dest.arrivalTime} - {dest.departureTime}
											</p>
											{#if dest.timeSlot && timeSlotLabels[dest.timeSlot]}
												<Badge variant="outline" class="border-accent/30 text-[10px] text-accent">
													{timeSlotLabels[dest.timeSlot]}指定
												</Badge>
											{/if}
										</div>
									</Card.Action>
								</Card.Header>
								<Card.Content>
									<p
										class="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground"
									>
										{dest.description}
									</p>
								</Card.Content>
							</Card.Root>
						</div>
					</div>
				{/each}

				{#if result.endDestination}
					<div in:fly={{ x: -10, duration: 400, delay: 150 + result.destinations.length * 80 }}>
						<div class="flex items-stretch gap-3">
							<div class="flex flex-col items-center">
								<div
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"
								>
									<Flag class="size-4" />
								</div>
							</div>
							<Card.Root class="mb-3 flex-1 border-primary/10 bg-card/80">
								<Card.Header>
									<Card.Description>ゴール</Card.Description>
									<Card.Title class="text-primary">{result.endDestination.name}</Card.Title>
									<Card.Description class="flex items-center gap-1">
										<MapPin class="size-3 shrink-0" />
										{result.endDestination.displayAddress}
									</Card.Description>
								</Card.Header>
							</Card.Root>
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
					<RotateCcw data-icon="inline-start" />
					もう一度計画する
				</Button>
			</div>
		</div>
	</div>
{/if}
