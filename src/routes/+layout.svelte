<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<style>
	:global(body) {
		/* プランBの温かい背景をさらに活かす */
		background-image: radial-gradient(circle at top right, oklch(0.95 0.03 60), transparent);
	}
</style>
