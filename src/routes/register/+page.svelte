<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import * as Alert from '$lib/components/ui/alert';
	import { AlertCircleIcon } from '@lucide/svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>rootist — 新規登録</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-6">
	<Card.Root class="w-full max-w-sm border-primary/10 bg-card/60 shadow-sm backdrop-blur-sm">
		<Card.Header>
			<Card.Title class="text-xl">
				<h1>新規登録</h1>
			</Card.Title>
			<Card.Description>メールアドレスとパスワードでアカウントを作成します。</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				class="flex flex-col gap-4"
			>
				{#if form?.message}
					<Alert.Root variant="destructive">
						<AlertCircleIcon />
						<Alert.Description>{form.message}</Alert.Description>
					</Alert.Root>
				{/if}

				<Field.Field>
					<Field.FieldLabel for="email">メールアドレス</Field.FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
					/>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="password">パスワード</Field.FieldLabel>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						minlength={8}
						required
					/>
					<Field.FieldDescription>8文字以上で入力してください。</Field.FieldDescription>
				</Field.Field>

				<Button type="submit" disabled={submitting} class="mt-2 w-full">
					{submitting ? '登録中…' : '新規登録'}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center text-sm text-muted-foreground">
			すでにアカウントをお持ちの方は <a href={resolve('/login')} class="ml-1 text-accent underline"
				>ログイン</a
			>
		</Card.Footer>
	</Card.Root>
</div>
