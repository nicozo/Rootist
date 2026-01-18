<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Compass, Sparkles, Navigation, History, ArrowRight } from "@lucide/svelte";
	import { fly, fade } from "svelte/transition";
	import { backOut } from "svelte/easing";

	let showContent = $state(false);

	// マウント時にアニメーションを開始
	import { onMount } from "svelte";
	onMount(() => {
		showContent = true;
	});
</script>

<div class="h-screen bg-background flex flex-col items-center justify-center p-8 text-center overflow-hidden">
	{#if showContent}
		<div in:fly={{ y: -20, duration: 1000, easing: backOut }} class="relative w-28 h-28 mb-10">
			<div class="absolute inset-0 bg-accent/20 blur-2xl rounded-full animate-pulse"></div>
			
			<div class="relative w-28 h-28 bg-primary rounded-[2.5rem] flex items-center justify-center shadow-xl border border-accent/10">
				<div class="relative">
					<Compass class="w-14 h-14 text-accent/90" />
					<Sparkles class="absolute -top-1 -right-1 w-6 h-6 text-accent animate-bounce" style="animation-duration: 3s" />
				</div>
			</div>
		</div>

		<div in:fly={{ y: 20, duration: 800, delay: 300 }} class="space-y-4 mb-12">
			<h1 class="text-4xl font-bold tracking-tight text-primary">
				Rootist <span class="text-accent font-medium">AI</span>
			</h1>
			<p class="text-muted-foreground max-w-xs mx-auto leading-relaxed text-sm font-medium">
				行きたい場所を、最高にスムーズな一本道へ。<br>
				AIの知性が、あなたの旅から<br>
				「迷う時間」を「楽しむ時間」に変えてくれます。
			</p>
		</div>

		<div in:fly={{ y: 20, duration: 800, delay: 600 }} class="grid gap-4 w-full max-w-sm mb-12">
			<div class="p-4 rounded-2xl border border-primary/10 bg-card/50 backdrop-blur-sm flex items-center gap-4 shadow-sm">
				<div class="bg-accent/10 p-2.5 rounded-xl"><Navigation class="w-5 h-5 text-accent" /></div>
				<div class="text-left">
					<span class="text-xs font-bold text-primary block">最短ルートを自動生成</span>
					<p class="text-[11px] text-muted-foreground leading-tight">目的地を、物理的に最も効率よく回れる順序で繋ぎます。</p>
				</div>
			</div>

			<div in:fly={{ y: 20, duration: 800, delay: 800 }} class="p-4 rounded-2xl border border-primary/10 bg-card/50 backdrop-blur-sm flex items-center gap-4 shadow-sm">
				<div class="bg-primary/10 p-2.5 rounded-xl"><History class="w-5 h-5 text-primary" /></div>
				<div class="text-left">
					<span class="text-xs font-bold text-primary block">時間に余裕を、心に自由を</span>
					<p class="text-[11px] text-muted-foreground leading-tight">計算はAIに任せて、あなたは景色を楽しむ準備をするだけ。</p>
				</div>
			</div>
		</div>

		<div in:fade={{ duration: 500, delay: 1200 }} class="w-full max-w-xs">
			<Button 
				href="/plan" 
				class="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-7 rounded-2xl text-lg font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-95 group"
			>
				旅を始める
				<ArrowRight class="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
			</Button>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		/* プランBの温かい背景をさらに活かす */
		background-image: radial-gradient(circle at top right, oklch(0.95 0.03 60), transparent);
	}
</style>
