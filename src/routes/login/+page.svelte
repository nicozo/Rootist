<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { AlertCircleIcon } from '@lucide/svelte';
	import GoogleIcon from '#lib/components/google-icon.svelte';
	import type { PageProps } from './$types';

	let { data }: Pick<PageProps, 'data' | 'form'> = $props();
</script>

<svelte:head>
	<title>rootist — ログイン</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-6">
	<Card.Root class="w-full max-w-sm border-primary/10 bg-card/60 shadow-sm backdrop-blur-sm">
		<Card.Header>
			<Card.Title class="text-xl">
				<h1>ログイン</h1>
			</Card.Title>
			<Card.Description>
				Googleアカウントでログインします。初めての方はアカウントが作られます。
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if data.googleError}
				<Alert.Root variant="destructive">
					<AlertCircleIcon />
					<Alert.Description>{data.googleError}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if data.googleAuthEnabled}
				<form method="POST" action="/auth/google">
					<Button type="submit" variant="outline" class="w-full">
						<GoogleIcon data-icon="inline-start" />
						Googleでログイン
					</Button>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">現在ログインできません。</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
