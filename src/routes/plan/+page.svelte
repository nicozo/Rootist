<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Field from '$lib/components/ui/field';
	import * as Item from '$lib/components/ui/item';
	import * as Empty from '$lib/components/ui/empty';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Alert from '$lib/components/ui/alert';
	import PlaceCombobox from '$lib/components/place-combobox.svelte';
	import TimePicker from '$lib/components/time-picker.svelte';
	import {
		MapPin,
		Navigation,
		Trash2,
		Sparkles,
		Home,
		X,
		ChevronDown,
		Flag,
		TrainFront,
		Car,
		Footprints,
		Sunrise,
		Sun,
		Moon,
		ArrowLeft,
		AlertCircleIcon
	} from '@lucide/svelte';
	import { fly, slide } from 'svelte/transition';
	import { routeResult } from '$lib/stores/route';

	// 詳細設定の開閉
	let isDetailsOpen = $state(false);

	// 移動手段
	type TransportMode = 'transit' | 'car' | 'walking' | '';
	let transportMode = $state<TransportMode>('');

	// 出発地
	let origin = $state<{ name: string; displayAddress: string } | null>(null);

	// 開始時間
	let startTime = $state('');

	// 終点
	let endDestination = $state<{ name: string; displayAddress: string } | null>(null);

	// 時間帯タグ（'' = 指定なし）
	type TimeSlot = 'morning' | 'noon' | 'night' | '';
	const timeSlotOptions: { value: Exclude<TimeSlot, ''>; label: string; icon: typeof Sunrise }[] = [
		{ value: 'morning', label: '朝', icon: Sunrise },
		{ value: 'noon', label: '昼', icon: Sun },
		{ value: 'night', label: '晩', icon: Moon }
	];

	// 目的地リスト
	let locations = $state<
		{ id: string; address: string; displayAddress?: string; timeSlot: TimeSlot }[]
	>([]);
	let isGenerating = $state(false);
	let generateError = $state<string | null>(null);

	// あと何件で生成可能か（0 なら生成可能）
	const remainingToGenerate = $derived(Math.max(0, 2 - locations.length));

	// 詳細設定の設定済みサマリ（折りたたみ中でも状態がわかる）
	const transportShortLabels: Record<Exclude<TransportMode, ''>, string> = {
		transit: '電車',
		car: '車',
		walking: '徒歩'
	};
	const detailSummary = $derived(
		[
			transportMode ? transportShortLabels[transportMode] : null,
			startTime || null,
			endDestination ? '終点あり' : null
		].filter((v): v is string => v !== null)
	);

	function removeLocation(id: string) {
		locations = locations.filter((loc) => loc.id !== id);
	}

	async function generateRoute() {
		isGenerating = true;
		generateError = null;
		try {
			const res = await fetch('/api/route', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					origin: origin ?? undefined,
					transportMode: transportMode || undefined,
					startTime: startTime || undefined,
					endDestination: endDestination ?? undefined,
					locations: locations.map((l) => ({
						name: l.address,
						displayAddress: l.displayAddress ?? '',
						timeSlot: l.timeSlot || undefined
					}))
				})
			});
			if (!res.ok) {
				generateError = 'ルート生成に失敗しました。もう一度お試しください。';
				return;
			}
			const data = await res.json();
			routeResult.set(data);
			goto(resolve('/plan/result'));
		} catch {
			generateError = '通信エラーが発生しました。もう一度お試しください。';
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="min-h-screen bg-background p-4 md:p-8">
	<div class="mx-auto flex max-w-2xl flex-col gap-8">
		<header class="mb-8 flex items-center gap-3" in:fly={{ y: -10, duration: 600 }}>
			<Button
				href="/"
				variant="ghost"
				size="icon"
				aria-label="トップに戻る"
				class="text-muted-foreground hover:text-primary"
			>
				<ArrowLeft />
			</Button>
			<div class="rounded-xl bg-primary p-2 shadow-lg">
				<Navigation class="size-6 text-accent" />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-primary">ルート作成</h1>
				<p class="text-xs font-medium text-muted-foreground">行きたい場所を入力してください</p>
			</div>
		</header>

		<Field.FieldGroup>
			<!-- 出発地（任意） -->
			<Field.Field>
				<Field.FieldLabel for="origin">出発地（任意）</Field.FieldLabel>
				<Field.FieldDescription>
					設定すると出発地からの移動を含めたプランを作成します
				</Field.FieldDescription>
				{#if origin}
					<div in:fly={{ x: -10, duration: 300 }}>
						<Item.Item variant="outline" size="sm" class="border-accent/20 bg-accent/5">
							<Item.ItemMedia class="size-6 rounded-full bg-accent/20 text-accent">
								<Home class="size-3" />
							</Item.ItemMedia>
							<Item.ItemContent>
								<Item.ItemTitle>{origin.name}</Item.ItemTitle>
								<Item.ItemDescription>{origin.displayAddress}</Item.ItemDescription>
							</Item.ItemContent>
							<Item.ItemActions>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => (origin = null)}
									class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								>
									<X />
								</Button>
							</Item.ItemActions>
						</Item.Item>
					</div>
				{:else}
					<PlaceCombobox
						id="origin"
						icon={Home}
						placeholder="例：自宅最寄り駅、宿泊ホテル..."
						onSelect={(s) => (origin = { name: s.name, displayAddress: s.displayAddress })}
					/>
				{/if}
			</Field.Field>

			<!-- 目的地追加（メイン） -->
			<Field.Field>
				<Field.FieldLabel for="address">目的地を追加</Field.FieldLabel>
				<Field.FieldDescription>同じ都道府県内のスポットを入力してください</Field.FieldDescription>
				<PlaceCombobox
					id="address"
					icon={MapPin}
					placeholder="例：東京タワー、浅草寺..."
					onSelect={(s) =>
						locations.push({
							id: crypto.randomUUID(),
							address: s.name,
							displayAddress: s.displayAddress,
							timeSlot: ''
						})}
				/>
			</Field.Field>
		</Field.FieldGroup>

		<!-- 目的地リスト -->
		<section class="flex flex-col gap-3">
			<div class="ml-1 flex items-center justify-between">
				<h2 class="text-sm font-bold text-primary">目的地リスト</h2>
				{#if locations.length >= 2}
					<Badge variant="outline" class="border-accent/30 bg-accent/10 text-[10px] text-accent">
						{locations.length} 箇所 · 生成可能
					</Badge>
				{:else}
					<Badge variant="outline" class="border-primary/20 text-[10px] text-primary">
						{locations.length} 箇所
					</Badge>
				{/if}
			</div>

			{#if locations.length > 0}
				<p class="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
					<Sunrise class="size-3.5 shrink-0" />
					各スポットの訪問時間帯は任意です。未指定なら最短ルートで自動配置します。
				</p>
			{/if}

			{#if locations.length === 0}
				<Empty.Empty class="border border-dashed">
					<Empty.EmptyHeader>
						<Empty.EmptyMedia variant="icon">
							<MapPin />
						</Empty.EmptyMedia>
						<Empty.EmptyTitle>まだ目的地がありません</Empty.EmptyTitle>
						<Empty.EmptyDescription>
							上の検索から行きたい場所を追加しましょう。2件以上でルートを生成できます。
						</Empty.EmptyDescription>
					</Empty.EmptyHeader>
				</Empty.Empty>
			{:else}
				<Item.ItemGroup class="gap-3">
					{#each locations as loc, i (loc.id)}
						<div in:fly={{ x: -10, duration: 400 }} out:slide>
							<Item.Item variant="outline" size="sm">
								<Item.ItemMedia
									class="size-6 rounded-full bg-primary/10 text-[10px] font-black text-primary"
								>
									{i + 1}
								</Item.ItemMedia>
								<Item.ItemContent>
									<Item.ItemTitle>{loc.address}</Item.ItemTitle>
									{#if loc.displayAddress}
										<Item.ItemDescription>{loc.displayAddress}</Item.ItemDescription>
									{/if}
									<ToggleGroup.Root
										type="single"
										variant="outline"
										bind:value={loc.timeSlot}
										aria-label="訪問する時間帯"
										class="mt-1 w-fit"
									>
										{#each timeSlotOptions as opt (opt.value)}
											<ToggleGroup.Item
												value={opt.value}
												aria-label={opt.label}
												title={opt.label}
												class="gap-1 px-2.5 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
											>
												<opt.icon />
												{opt.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								</Item.ItemContent>
								<Item.ItemActions>
									<Button
										variant="ghost"
										size="icon"
										onclick={() => removeLocation(loc.id)}
										class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									>
										<Trash2 />
									</Button>
								</Item.ItemActions>
							</Item.Item>
						</div>
					{/each}
				</Item.ItemGroup>
			{/if}
		</section>

		<!-- 詳細設定（折りたたみ） -->
		<Collapsible.Root bind:open={isDetailsOpen}>
			<Collapsible.Trigger
				class="ml-1 flex w-full items-center gap-2 text-left text-sm font-bold text-primary [&[data-state=open]>svg]:rotate-180"
			>
				<ChevronDown class="size-4 transition-transform duration-200" />
				詳細設定（任意）
				{#if !isDetailsOpen && detailSummary.length > 0}
					<span class="ml-auto flex flex-wrap items-center justify-end gap-1">
						{#each detailSummary as s (s)}
							<Badge variant="secondary" class="text-[10px] font-normal">{s}</Badge>
						{/each}
					</span>
				{/if}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Field.FieldGroup class="pt-3">
					<!-- 移動手段 -->
					<Field.Field>
						<Field.FieldLabel>移動手段</Field.FieldLabel>
						<ToggleGroup.Root
							type="single"
							variant="outline"
							bind:value={transportMode}
							aria-label="移動手段"
							class="w-full"
						>
							<ToggleGroup.Item
								value="transit"
								class="h-auto flex-1 flex-col gap-1 py-2 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<TrainFront />
								電車・公共交通
							</ToggleGroup.Item>
							<ToggleGroup.Item
								value="car"
								class="h-auto flex-1 flex-col gap-1 py-2 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Car />
								車
							</ToggleGroup.Item>
							<ToggleGroup.Item
								value="walking"
								class="h-auto flex-1 flex-col gap-1 py-2 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Footprints />
								徒歩
							</ToggleGroup.Item>
						</ToggleGroup.Root>
					</Field.Field>

					<!-- 開始時間 -->
					<Field.Field>
						<Field.FieldLabel for="startTime">開始時間</Field.FieldLabel>
						<TimePicker id="startTime" bind:value={startTime} />
					</Field.Field>

					<!-- 終点 -->
					<Field.Field>
						<Field.FieldLabel for="endDestination">終点（宿泊先など）</Field.FieldLabel>
						{#if endDestination}
							<div in:fly={{ x: -10, duration: 300 }}>
								<Item.Item variant="outline" size="sm" class="border-primary/10">
									<Item.ItemMedia class="size-6 rounded-full bg-primary/10 text-primary">
										<Flag class="size-3" />
									</Item.ItemMedia>
									<Item.ItemContent>
										<Item.ItemTitle>{endDestination.name}</Item.ItemTitle>
										<Item.ItemDescription>{endDestination.displayAddress}</Item.ItemDescription>
									</Item.ItemContent>
									<Item.ItemActions>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => (endDestination = null)}
											class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										>
											<X />
										</Button>
									</Item.ItemActions>
								</Item.Item>
							</div>
						{:else}
							<PlaceCombobox
								id="endDestination"
								icon={Flag}
								placeholder="例：新宿グランドホテル..."
								onSelect={(s) =>
									(endDestination = { name: s.name, displayAddress: s.displayAddress })}
							/>
						{/if}
					</Field.Field>
				</Field.FieldGroup>
			</Collapsible.Content>
		</Collapsible.Root>

		<div
			class="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border/50 bg-background/90 px-4 pt-3 pb-4 backdrop-blur-sm md:-mx-8 md:px-8"
		>
			<Button
				onclick={generateRoute}
				disabled={isGenerating || remainingToGenerate > 0}
				class="group w-full rounded-2xl bg-accent py-7 text-lg font-bold text-accent-foreground shadow-xl shadow-accent/20 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{#if isGenerating}
					<Spinner data-icon="inline-start" />
					生成中...
				{:else}
					<Sparkles data-icon="inline-start" class="animate-pulse" />
					最適ルートを自動生成する
					<Navigation
						data-icon="inline-end"
						class="rotate-90 transition-transform group-hover:translate-x-1"
					/>
				{/if}
			</Button>
			{#if remainingToGenerate > 0}
				<p class="mt-2 text-center text-xs text-muted-foreground">
					あと {remainingToGenerate} 件の目的地を追加するとルートを生成できます
				</p>
			{/if}
			{#if generateError}
				<Alert.Root variant="destructive" class="mt-2">
					<AlertCircleIcon />
					<Alert.Description>{generateError}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</div>
</div>
