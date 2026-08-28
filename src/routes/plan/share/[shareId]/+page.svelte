<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import PlanTimeline from '$lib/components/plan-timeline.svelte';
	import { Navigation, MapPin } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let result = $derived(data.result);
</script>

<svelte:head>
	<title>rootist — 共有されたプラン</title>
</svelte:head>

<div class="min-h-screen bg-background p-4 md:p-8">
	<div class="mx-auto flex max-w-2xl flex-col gap-6">
		<header class="flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
			<div class="rounded-xl bg-primary p-2 shadow-lg">
				<Navigation class="size-6 text-accent" />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-primary">共有されたプラン</h1>
				<p class="text-xs font-medium text-muted-foreground">最適な訪問順序と1日のスケジュール</p>
			</div>
		</header>

		<PlanTimeline {result} />

		<div class="flex flex-col gap-2 rounded-xl border border-primary/10 bg-card/80 p-4">
			<p class="flex items-center gap-1 text-sm text-primary">
				<MapPin class="size-4 shrink-0" />
				自分だけの旅程を作ってみませんか？
			</p>
			<Button href={resolve('/plan')} class="w-full">自分もプランを作成する</Button>
		</div>
	</div>
</div>
