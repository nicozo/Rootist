<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { AlertCircleIcon, KeyRoundIcon } from '@lucide/svelte';
	import { isPasskeySupported, registerPasskey } from '#lib/passkey-client.js';

	// SvelteKit は data / form を渡すが、この画面は使わない（登録は remote function、「あとで」は form action の 303）
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, svelte/no-unused-props
	let _props: { data?: unknown; form?: unknown } = $props();

	let busy = $state(false);
	let registered = $state(false);
	let failed = $state(false);

	// 対応していないブラウザには案内を出さず、見送りの回数も増やさずに /plan へ移る（FR-019）
	onMount(() => {
		if (!isPasskeySupported()) goto(resolve('plan'));
	});

	async function register() {
		busy = true;
		failed = false;
		const ok = await registerPasskey();
		registered = ok;
		failed = !ok;
		busy = false;
	}
</script>

<svelte:head>
	<title>rootist — パスキーの登録</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-6">
	<Card.Root class="w-full max-w-sm border-primary/10 bg-card/60 shadow-sm backdrop-blur-sm">
		<Card.Header>
			<Card.Title class="text-xl">
				<h1>パスキーを登録しませんか</h1>
			</Card.Title>
			<Card.Description>
				パスキーを登録すると、次からは指紋・顔認証・端末の PIN だけでログインできます。
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if registered}
				<p class="text-sm">パスキーを登録しました</p>
				<Button href={resolve('plan')} class="w-full">プランを作る</Button>
			{:else}
				{#if failed}
					<Alert.Root variant="destructive">
						<AlertCircleIcon />
						<Alert.Description>
							パスキーを登録できませんでした。あとからでも登録できます。
						</Alert.Description>
					</Alert.Root>
				{/if}

				<Button type="button" class="w-full" disabled={busy} onclick={register}>
					<KeyRoundIcon data-icon="inline-start" />
					登録する
				</Button>

				<form method="POST" action="?/dismiss" use:enhance>
					<Button type="submit" variant="outline" class="w-full" disabled={busy}>あとで</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
