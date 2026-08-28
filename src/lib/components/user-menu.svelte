<script lang="ts">
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let { user }: { user: { email: string; name: string; image: string | null } } = $props();

	// issue #54: サロゲートペア対応のため charAt(0) ではなく配列スプレッドで先頭「文字」を取り出す。
	// nameが空文字のケースは想定薄だが念のためemailにフォールバックする。
	function firstGrapheme(value: string): string {
		const [first] = [...value];
		return first ?? '';
	}

	const initial = $derived((firstGrapheme(user.name) || firstGrapheme(user.email)).toUpperCase());

	// email文字列から決定的にhue(0-360)を導出する単純なハッシュ（djb2）。
	// 同一emailであれば常に同じhueになり、リロード・再ログインをまたいで一貫する。
	function hueFromEmail(email: string): number {
		let hash = 5381;
		for (let i = 0; i < email.length; i++) {
			hash = (hash * 33) ^ email.charCodeAt(i);
		}
		return Math.abs(hash) % 360;
	}

	const hue = $derived(hueFromEmail(user.email));
	const fallbackStyle = $derived(
		`background-color: oklch(0.85 0.06 ${hue}); color: oklch(0.35 0.06 ${hue});`
	);

	let logoutForm: HTMLFormElement | undefined = $state();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="アカウントメニュー"
		class="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
	>
		<Avatar.Root>
			<Avatar.Image src={user.image ?? undefined} alt="" />
			<Avatar.Fallback style={fallbackStyle} aria-hidden="true">{initial}</Avatar.Fallback>
		</Avatar.Root>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Label class="flex flex-col gap-0.5">
				<span class="truncate text-sm font-medium text-foreground">{user.name}</span>
				<span class="truncate text-xs text-muted-foreground">{user.email}</span>
			</DropdownMenu.Label>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<form method="POST" action="/logout" class="contents" bind:this={logoutForm}>
				<DropdownMenu.Item variant="destructive" onSelect={() => logoutForm?.requestSubmit()}>
					<LogOutIcon />
					ログアウト
				</DropdownMenu.Item>
			</form>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
