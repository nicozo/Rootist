<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const dropdownMenuItemVariants = tv({
		base: "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: 'focus:bg-accent focus:text-accent-foreground',
				destructive:
					'text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20 *:[svg]:text-destructive'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type DropdownMenuItemVariant = VariantProps<typeof dropdownMenuItemVariants>['variant'];
</script>

<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = 'default',
		...restProps
	}: DropdownMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: DropdownMenuItemVariant;
	} = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(dropdownMenuItemVariants({ variant }), className)}
	{...restProps}
/>
