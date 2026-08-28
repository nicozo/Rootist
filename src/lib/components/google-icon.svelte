<script lang="ts">
	// issue #42: @lucide/svelte にGoogleブランドアイコンが存在しないため、公式ブランドガイドライン
	// 準拠の"G"ロゴSVGを自作する。lucide-svelteのアイコンコンポーネントと同じ流儀
	// （ref/class/その他属性をsvgルートへスプレッド、固定サイズクラスは持たせない）に合わせることで、
	// Buttonの `[&_svg:not([class*='size-'])]:size-4` 等のサイズ制御・`data-icon` 配置と協調する。
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable<SVGSVGElement | null>(null),
		class: className,
		...restProps
	}: HTMLAttributes<SVGSVGElement> & { ref?: SVGSVGElement | null } = $props();
</script>

<svg
	bind:this={ref}
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...restProps}
>
	<path
		fill="#4285F4"
		d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.08 3.56-5.14 3.56-8.82z"
	/>
	<path
		fill="#34A853"
		d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
	/>
	<path
		fill="#FBBC05"
		d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.94 11.94 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
	/>
	<path
		fill="#EA4335"
		d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
	/>
</svg>
