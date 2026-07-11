<script lang="ts">
	// UIコンポーネントのインポート
	import { Button } from '$lib/components/ui/button';
	// アイコンのインポート
	import {
		CompassIcon,
		SparklesIcon,
		NavigationIcon,
		HistoryIcon,
		ArrowRightIcon
	} from '@lucide/svelte';
	// Svelteの状態管理とアニメーションのインポート
	import { fly, fade } from 'svelte/transition';
	import { backOut } from 'svelte/easing';

	let showContent = $state(false);

	// マウント時にアニメーションを開始
	import { onMount } from 'svelte';
	onMount(() => {
		showContent = true;
	});
</script>

<div
	class="flex h-screen flex-col items-center justify-center overflow-hidden bg-background p-8 text-center"
>
	{#if showContent}
		<div in:fly={{ y: -20, duration: 1000, easing: backOut }} class="relative mb-10 h-28 w-28">
			<div class="absolute inset-0 animate-pulse rounded-full bg-accent/20 blur-2xl"></div>

			<div
				class="relative flex h-28 w-28 items-center justify-center rounded-[2.5rem] border border-accent/10 bg-primary shadow-xl"
			>
				<div class="relative">
					<CompassIcon class="h-14 w-14 text-accent/90" />
					<SparklesIcon
						class="absolute -top-1 -right-1 h-6 w-6 animate-bounce text-accent"
						style="animation-duration: 3s"
					/>
				</div>
			</div>
		</div>

		<div in:fly={{ y: 20, duration: 800, delay: 300 }} class="mb-12 space-y-4">
			<h1 class="text-4xl font-bold tracking-tight text-primary">
				Rootist <span class="font-medium text-accent">AI</span>
			</h1>
			<p class="mx-auto max-w-xs text-sm leading-relaxed font-medium text-muted-foreground">
				行きたい場所を、最高にスムーズな一本道へ。<br />
				AIの知性が、あなたの旅から<br />
				「迷う時間」を「楽しむ時間」に変えてくれます。
			</p>
		</div>

		<div in:fly={{ y: 20, duration: 800, delay: 600 }} class="mb-12 grid w-full max-w-sm gap-4">
			<div
				class="flex items-center gap-4 rounded-2xl border border-primary/10 bg-card/50 p-4 shadow-sm backdrop-blur-sm"
			>
				<div class="rounded-xl bg-accent/10 p-2.5">
					<NavigationIcon class="h-5 w-5 text-accent" />
				</div>
				<div class="text-left">
					<span class="block text-xs font-bold text-primary">最短ルートを自動生成</span>
					<p class="text-[11px] leading-tight text-muted-foreground">
						目的地を、物理的に最も効率よく回れる順序で繋ぎます。
					</p>
				</div>
			</div>

			<div
				in:fly={{ y: 20, duration: 800, delay: 800 }}
				class="flex items-center gap-4 rounded-2xl border border-primary/10 bg-card/50 p-4 shadow-sm backdrop-blur-sm"
			>
				<div class="rounded-xl bg-primary/10 p-2.5">
					<HistoryIcon class="h-5 w-5 text-primary" />
				</div>
				<div class="text-left">
					<span class="block text-xs font-bold text-primary">時間に余裕を、心に自由を</span>
					<p class="text-[11px] leading-tight text-muted-foreground">
						計算はAIに任せて、あなたは景色を楽しむ準備をするだけ。
					</p>
				</div>
			</div>
		</div>

		<div in:fade={{ duration: 500, delay: 1200 }} class="w-full max-w-xs">
			<Button
				href="/plan"
				class="group w-full rounded-2xl bg-primary py-7 text-lg font-bold text-primary-foreground shadow-lg transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-95"
			>
				旅を始める
				<ArrowRightIcon class="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
			</Button>
		</div>
	{/if}
</div>
