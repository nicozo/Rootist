<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { routeResult } from '$lib/stores/route';
	import { Button } from '$lib/components/ui/button';
	import PlanTimeline from '$lib/components/plan-timeline.svelte';
	import { Navigation, RotateCcw, Share2, Check, Loader2 } from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	let result = $state($routeResult);

	onMount(() => {
		if (!result) goto(resolve('/plan'));
	});

	let shareId = $state<string | null>(null);
	let sharing = $state(false);
	let shareError = $state<string | null>(null);
	let copied = $state(false);
	let manualShareUrl = $state<string | null>(null);

	function buildShareUrl(id: string) {
		return `${window.location.origin}${resolve('/plan/share/[shareId]', { shareId: id })}`;
	}

	async function copyToClipboard(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			manualShareUrl = null;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// クリップボードAPIが使えない環境向けフォールバック: URLを手動コピーできるよう表示する
			manualShareUrl = url;
		}
	}

	async function handleShare() {
		if (sharing) return;
		shareError = null;

		if (shareId) {
			await copyToClipboard(buildShareUrl(shareId));
			return;
		}

		if (!result) return;
		sharing = true;
		try {
			const res = await fetch('/api/plans', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(result)
			});
			if (!res.ok) {
				shareError = 'プランの共有に失敗しました。時間をおいて再度お試しください。';
				return;
			}
			const data: { shareId: string } = await res.json();
			shareId = data.shareId;
			await copyToClipboard(buildShareUrl(shareId));
		} catch {
			shareError = 'プランの共有に失敗しました。時間をおいて再度お試しください。';
		} finally {
			sharing = false;
		}
	}
</script>

<svelte:head>
	<title>rootist — あなたの1日プラン</title>
</svelte:head>

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

			<PlanTimeline {result} />

			<div class="flex flex-col gap-2" in:fade={{ duration: 400, delay: 300 }}>
				<Button onclick={handleShare} disabled={sharing} class="w-full">
					{#if sharing}
						<Loader2 data-icon="inline-start" class="animate-spin" />
						共有リンクを発行中…
					{:else if copied}
						<Check data-icon="inline-start" />
						リンクをコピーしました
					{:else}
						<Share2 data-icon="inline-start" />
						同行者に共有
					{/if}
				</Button>
				<p class="text-center text-xs text-muted-foreground">
					リンクを知っている人はログインなしでプランを見られます
				</p>
				{#if shareError}
					<p class="text-center text-xs font-medium text-destructive">{shareError}</p>
				{/if}
				{#if manualShareUrl}
					<p class="text-center text-xs break-all text-muted-foreground">
						自動コピーに失敗しました。こちらのURLを手動でコピーしてください: {manualShareUrl}
					</p>
				{/if}
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
