<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { AlertCircleIcon } from '@lucide/svelte';

	// form action（/login・/register の sendCode / verifyCode）の戻り値。
	// 状態は戻り値だけで持つ（サーバーに途中の状態は保存しない。data-model.md「画面の状態」）
	type CodeFormState = { step?: 'email' | 'code'; message?: string; email?: string };

	let { form }: { form: CodeFormState | null | undefined } = $props();

	let submitting = $state(false);
	// 「メールアドレスを変える」で戻ったとき。次に送信し終わるまでメール入力を出す
	let editingEmail = $state(false);

	const step = $derived(!editingEmail && form?.step === 'code' ? 'code' : 'email');
	const email = $derived(form?.email ?? '');
	const message = $derived(editingEmail ? null : (form?.message ?? null));

	const handleSubmit: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => {
			await update();
			editingEmail = false;
			submitting = false;
		};
	};
</script>

<div class="flex flex-col gap-4">
	{#if message}
		<Alert.Root variant="destructive">
			<AlertCircleIcon />
			<Alert.Description>{message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if step === 'email'}
		<form method="POST" action="?/sendCode" use:enhance={handleSubmit} class="flex flex-col gap-4">
			<Field.Field>
				<Field.FieldLabel for="email">メールアドレス</Field.FieldLabel>
				<Input id="email" name="email" type="email" autocomplete="email" required value={email} />
			</Field.Field>

			<Button type="submit" disabled={submitting} class="w-full">
				{submitting ? '送信中…' : 'コードを送る'}
			</Button>
		</form>
	{:else}
		<p class="text-sm text-muted-foreground">{email} 宛てにコードを送りました。</p>

		<form
			method="POST"
			action="?/verifyCode"
			use:enhance={handleSubmit}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="email" value={email} />

			<Field.Field>
				<Field.FieldLabel for="code">6桁のコード</Field.FieldLabel>
				<Input
					id="code"
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={6}
					pattern="[0-9]+"
					required
				/>
			</Field.Field>

			<Button type="submit" disabled={submitting} class="w-full">
				{submitting ? '確認中…' : 'コードを確認する'}
			</Button>
		</form>

		<form method="POST" action="?/sendCode" use:enhance={handleSubmit}>
			<input type="hidden" name="email" value={email} />
			<input type="hidden" name="resend" value="1" />
			<Button type="submit" variant="outline" disabled={submitting} class="w-full">
				コードを再送する
			</Button>
		</form>

		<Button type="button" variant="link" onclick={() => (editingEmail = true)}>
			メールアドレスを変える
		</Button>
	{/if}
</div>
