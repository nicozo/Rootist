<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import {
		MapPin,
		Clock,
		ChevronDown,
		Home,
		TrainFront,
		Car,
		Footprints,
		Flag
	} from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import type { RouteResult } from '$lib/stores/route';
	import { isStayMinutesPreset, formatStayMinutes } from '$lib/stay-minutes';

	interface Props {
		result: RouteResult;
	}

	let { result }: Props = $props();

	const timeSlotLabels: Record<string, string> = {
		morning: '朝',
		noon: '昼',
		night: '晩'
	};
</script>

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
								{#if isStayMinutesPreset(dest.stayMinutes)}
									<Badge variant="outline" class="border-accent/30 text-[10px] text-accent">
										滞在{formatStayMinutes(dest.stayMinutes)}指定
									</Badge>
								{/if}
							</div>
						</Card.Action>
					</Card.Header>
					<Card.Content>
						<p class="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
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
