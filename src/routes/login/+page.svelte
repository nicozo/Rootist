<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { AlertCircleIcon, KeyRoundIcon } from '@lucide/svelte';
	import GoogleIcon from '#lib/components/google-icon.svelte';
	import EmailCodeForm from '#lib/components/email-code-form.svelte';
	import { isPasskeySupported, signInWithPasskey } from '#lib/passkey-client.js';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	// パスキーの対応はブラウザでしか分からない。対応していなければボタンを出さない（FR-019）
	let passkeySupported = $state(false);
	let passkeyBusy = $state(false);
	let passkeyFailed = $state(false);

	onMount(() => {
		passkeySupported = isPasskeySupported();
	});

	// FR-018: 取り消し・失敗では画面にとどまり、メールのコードか Google でも入れることを伝える
	const PASSKEY_LOGIN_FAILURE =
		'パスキーでログインできませんでした。メールのコードかGoogleでもログインできます。';

	async function loginWithPasskey() {
		passkeyBusy = true;
		passkeyFailed = false;
		const ok = await signInWithPasskey();
		if (ok) {
			// セッションの Cookie はサーバーが書いた。ユーザー情報を読み直すため invalidateAll する
			await goto(resolve('plan'), { invalidateAll: true });
		} else {
			passkeyFailed = true;
		}
		passkeyBusy = false;
	}

	// コードのメッセージは EmailCodeForm が出す。Google 側のキャンセル・失敗とパスキーの失敗はここで出す
	const pageError = $derived(
		passkeyFailed ? PASSKEY_LOGIN_FAILURE : form?.message ? null : (data.googleError ?? null)
	);
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
			<Card.Description>メールアドレスに届くコードでログインします。</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if pageError}
				<Alert.Root variant="destructive">
					<AlertCircleIcon />
					<Alert.Description>{pageError}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if passkeySupported}
				<Button type="button" class="w-full" disabled={passkeyBusy} onclick={loginWithPasskey}>
					<KeyRoundIcon data-icon="inline-start" />
					パスキーでログイン
				</Button>

				<div class="relative flex items-center justify-center">
					<Separator class="absolute inset-x-0" />
					<span class="relative bg-card px-2 text-xs text-muted-foreground">または</span>
				</div>
			{/if}

			<EmailCodeForm {form} />

			{#if data.googleAuthEnabled}
				<div class="relative flex items-center justify-center">
					<Separator class="absolute inset-x-0" />
					<span class="relative bg-card px-2 text-xs text-muted-foreground">または</span>
				</div>

				<form method="POST" action="/auth/google">
					<Button type="submit" variant="outline" class="w-full">
						<GoogleIcon data-icon="inline-start" />
						Googleでログイン
					</Button>
				</form>
			{/if}
		</Card.Content>

		<Card.Footer class="justify-center text-sm text-muted-foreground">
			アカウントをお持ちでない方は

			<a href={resolve('register')} class="ml-1 text-accent underline">新規登録</a>
		</Card.Footer>
	</Card.Root>
</div>
