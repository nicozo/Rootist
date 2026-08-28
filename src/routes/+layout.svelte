<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import UserMenu from '$lib/components/user-menu.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<nav
	class="fixed top-0 right-0 z-50 flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground sm:px-4"
	aria-label="アカウント"
>
	{#if data.user}
		<UserMenu user={data.user} />
	{:else}
		<a href={resolve('/login')} class="text-accent underline underline-offset-2">ログイン</a>
		<a href={resolve('/register')} class="text-accent underline underline-offset-2">新規登録</a>
	{/if}
</nav>

{@render children()}

<style>
	:global(body) {
		/* プランBの温かい背景をさらに活かす */
		background-image: radial-gradient(circle at top right, oklch(0.95 0.03 60), transparent);
	}
</style>
