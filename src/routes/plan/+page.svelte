<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Field from '$lib/components/ui/field';
	import * as Item from '$lib/components/ui/item';
	import * as Empty from '$lib/components/ui/empty';
	import * as Card from '$lib/components/ui/card';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Alert from '$lib/components/ui/alert';
	import * as Select from '$lib/components/ui/select';
	import PlaceCombobox from '$lib/components/place-combobox.svelte';
	import TimePicker from '$lib/components/time-picker.svelte';
	import {
		MapPin,
		Navigation,
		Trash2,
		Sparkles,
		Home,
		X,
		Plus,
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
	import { fly, slide, fade } from 'svelte/transition';
	import { get } from 'svelte/store';
	import { routeResult, planDraft } from '$lib/stores/route';
	import { STAY_MINUTES_PRESETS, formatStayMinutes } from '$lib/stay-minutes';

	// issue #64: 「もう一度計画する」で戻ってきた場合のみ、直前の入力を1回だけ復元する。
	// 読み取り後は即座にリセットする消費型ストアのため、それ以外の経路（トップからの遷移・
	// 共有ページ経由・直接URL・リロード等）では draft は常に null で「新規」扱いになる。
	const restoredDraft = get(planDraft);
	if (restoredDraft) planDraft.set(null);

	// 移動手段
	type TransportMode = 'transit' | 'car' | 'walking' | '';
	let transportMode = $state<TransportMode>(restoredDraft?.transportMode ?? '');

	// 出発地
	let origin = $state<{ name: string; displayAddress: string } | null>(
		restoredDraft?.origin ?? null
	);

	// 出発時刻
	let startTime = $state(restoredDraft?.startTime ?? '');

	// ゴール（宿泊先など）
	let endDestination = $state<{ name: string; displayAddress: string } | null>(
		restoredDraft?.endDestination ?? null
	);
	// ゴール入力欄の展開状態
	let isGoalOpen = $state(false);

	// 時間帯タグ（'' = 指定なし）
	type TimeSlot = 'morning' | 'noon' | 'night' | '';
	const timeSlotOptions: { value: Exclude<TimeSlot, ''>; label: string; icon: typeof Sunrise }[] = [
		{ value: 'morning', label: '朝', icon: Sunrise },
		{ value: 'noon', label: '昼', icon: Sun },
		{ value: 'night', label: '晩', icon: Moon }
	];

	// 滞在時間プリセット（'' = 指定なし）
	type StayMinutes = number | '';
	const stayMinutesOptions = STAY_MINUTES_PRESETS.map((m) => ({
		value: m,
		label: formatStayMinutes(m)
	}));

	// 行きたい場所リスト（復元時はidを新規発行し直し、重複・欠落を防ぐ）
	let locations = $state<
		{
			id: string;
			address: string;
			displayAddress?: string;
			timeSlot: TimeSlot;
			stayMinutes: StayMinutes;
			arriveAt: string;
		}[]
	>(
		(restoredDraft?.locations ?? []).map((loc) => ({
			id: crypto.randomUUID(),
			address: loc.address,
			displayAddress: loc.displayAddress,
			timeSlot: loc.timeSlot,
			stayMinutes: loc.stayMinutes,
			arriveAt: loc.arriveAt ?? ''
		}))
	);
	let isGenerating = $state(false);
	let generateError = $state<string | null>(null);

	// あと何件でプランを作成できるか（0 なら作成可能）
	const remainingToGenerate = $derived(Math.max(0, 2 - locations.length));

	function removeLocation(id: string) {
		locations = locations.filter((loc) => loc.id !== id);
	}

	// 訪問時刻と時間帯（朝・昼・晩）は「いつ行くか」を指す同じ役割の指定であり、
	// 同時に指定すると矛盾しうる（例: 「朝」と 19:00）。より具体的な指定を残すため、
	// 片方を指定したらもう片方は解除する排他とする（issue #70）。
	function setTimeSlot(loc: { timeSlot: TimeSlot; arriveAt: string }, value: TimeSlot) {
		loc.timeSlot = value;
		if (value) loc.arriveAt = '';
	}

	function setArriveAt(loc: { timeSlot: TimeSlot; arriveAt: string }, value: string) {
		loc.arriveAt = value;
		if (value) loc.timeSlot = '';
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
						timeSlot: l.timeSlot || undefined,
						stayMinutes: l.stayMinutes || undefined,
						arriveAt: l.arriveAt || undefined
					}))
				})
			});
			if (!res.ok) {
				generateError = 'プランの作成に失敗しました。もう一度お試しください。';
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

<svelte:head>
	<title>rootist — 旅行プランをつくる</title>
</svelte:head>

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
				<h1 class="text-2xl font-bold text-primary">旅行プランをつくる</h1>
				<p class="text-xs font-medium text-muted-foreground">
					行きたい場所を入れるだけ。順番と時間はAIが決めます
				</p>
			</div>
		</header>

		<!-- 出発カード（任意） -->
		<Card.Root class="gap-3 border-primary/10 bg-card/50 py-4 shadow-none">
			<Card.Content class="flex flex-col gap-3 px-4">
				<div>
					<p class="text-sm font-bold text-primary">出発（任意）</p>
					<p class="text-xs text-muted-foreground">設定するとより正確なプランになります</p>
				</div>

				<!-- 出発地 -->
				{#if origin}
					<div in:fly={{ x: -10, duration: 300 }}>
						<Item.ItemGroup>
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
										aria-label="出発地の選択を解除"
										onclick={() => (origin = null)}
										class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									>
										<X />
									</Button>
								</Item.ItemActions>
							</Item.Item>
						</Item.ItemGroup>
					</div>
				{:else}
					<PlaceCombobox
						id="origin"
						label="出発地"
						icon={Home}
						placeholder="例：自宅最寄り駅、宿泊ホテル..."
						onSelect={(s) => (origin = { name: s.name, displayAddress: s.displayAddress })}
					/>
				{/if}

				<!-- 出発時刻・移動手段 -->
				<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
					<Field.Field class="sm:w-auto">
						<Field.FieldLabel for="startTime" class="text-xs">出発時刻</Field.FieldLabel>
						<TimePicker id="startTime" bind:value={startTime} />
					</Field.Field>

					<Field.Field class="sm:flex-1">
						<Field.FieldLabel class="text-xs">移動手段</Field.FieldLabel>
						<ToggleGroup.Root
							type="single"
							variant="outline"
							bind:value={transportMode}
							aria-label="移動手段"
							class="w-fit"
						>
							<ToggleGroup.Item
								value="transit"
								aria-label="公共交通機関"
								class="gap-1 px-2.5 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<TrainFront />
								公共交通機関
							</ToggleGroup.Item>
							<ToggleGroup.Item
								value="car"
								class="gap-1 px-2.5 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Car />
								車
							</ToggleGroup.Item>
							<ToggleGroup.Item
								value="walking"
								class="gap-1 px-2.5 text-xs data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Footprints />
								徒歩
							</ToggleGroup.Item>
						</ToggleGroup.Root>
					</Field.Field>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- 行きたい場所（主役） -->
		<section class="flex flex-col gap-3">
			<div class="ml-1 flex items-center justify-between">
				<h2 class="text-lg font-bold text-primary">行きたい場所</h2>
				{#if locations.length >= 2}
					<Badge variant="outline" class="border-accent/30 bg-accent/10 text-[10px] text-accent">
						{locations.length} 箇所 · 作成できます
					</Badge>
				{:else}
					<Badge variant="outline" class="border-primary/20 text-[10px] text-primary">
						{locations.length} 箇所
					</Badge>
				{/if}
			</div>

			<Field.Field>
				<Field.FieldLabel for="address">行きたい場所を追加</Field.FieldLabel>
				<Field.FieldDescription>同じ都道府県内のスポットを入力してください</Field.FieldDescription>
				<PlaceCombobox
					id="address"
					label="行きたい場所を追加"
					icon={MapPin}
					placeholder="例：東京タワー、浅草寺..."
					onSelect={(s) =>
						locations.push({
							id: crypto.randomUUID(),
							address: s.name,
							displayAddress: s.displayAddress,
							timeSlot: '',
							stayMinutes: '',
							arriveAt: ''
						})}
				/>
			</Field.Field>

			{#if locations.length > 0}
				<p class="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
					<Sunrise class="size-3.5 shrink-0" />
					各スポットの訪問時間帯・訪問時刻・滞在時間はいずれも任意です。未指定なら最適な順番・時間配分で自動的に決まります。時刻を指定すると時間帯の指定は解除されます。
				</p>
			{/if}

			{#if locations.length === 0}
				<Empty.Empty class="border border-dashed">
					<Empty.EmptyHeader>
						<Empty.EmptyMedia variant="icon">
							<MapPin />
						</Empty.EmptyMedia>
						<Empty.EmptyTitle>まだ行きたい場所がありません</Empty.EmptyTitle>
						<Empty.EmptyDescription>
							上の検索から行きたい場所を追加しましょう。2件以上でプランを作成できます。
						</Empty.EmptyDescription>
					</Empty.EmptyHeader>
				</Empty.Empty>
			{:else}
				<Item.ItemGroup class="gap-3">
					{#each locations as loc, i (loc.id)}
						<div in:fly={{ x: -10, duration: 400 }} out:slide>
							<Item.Item variant="outline" size="sm" class="bg-card shadow-sm">
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
									<!-- 時間帯と滞在時間は同じ「いつ・どれくらい」の指定なので横に並べる。
									     狭い幅では flex-wrap で自然に折り返す。 -->
									<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
										<ToggleGroup.Root
											type="single"
											variant="outline"
											value={loc.timeSlot}
											onValueChange={(v) => setTimeSlot(loc, v as TimeSlot)}
											aria-label="訪問する時間帯"
											class="w-fit"
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
										<!-- 訪問時刻（何時に着くか）と滞在時間（どれだけいるか）は隣り合うと
										     区別しづらいため、時計アイコンではなく短いラベルで見分けさせる。 -->
										<div class="flex items-center gap-1.5">
											<span class="shrink-0 text-xs text-muted-foreground">訪問</span>
											<TimePicker
												value={loc.arriveAt}
												onValueChange={(v) => setArriveAt(loc, v)}
												clearable
												size="sm"
												labelPrefix="訪問時刻"
												showIcon={false}
											/>
										</div>
										<div class="flex items-center gap-1.5">
											<span class="shrink-0 text-xs text-muted-foreground">滞在</span>
											<Select.Root
												type="single"
												value={loc.stayMinutes === '' ? '' : String(loc.stayMinutes)}
												onValueChange={(v) => (loc.stayMinutes = v ? Number(v) : '')}
											>
												<Select.Trigger aria-label="滞在時間" size="sm" class="w-28 text-xs">
													{loc.stayMinutes === '' ? '指定なし' : formatStayMinutes(loc.stayMinutes)}
												</Select.Trigger>
												<Select.Content>
													<Select.Group>
														<Select.Item value="">指定なし</Select.Item>
														{#each stayMinutesOptions as opt (opt.value)}
															<Select.Item value={String(opt.value)}>{opt.label}</Select.Item>
														{/each}
													</Select.Group>
												</Select.Content>
											</Select.Root>
										</div>
									</div>
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

		<!-- ゴール（宿泊先など） -->
		<section>
			{#if endDestination}
				<div in:fly={{ x: -10, duration: 300 }}>
					<Item.ItemGroup>
						<Item.Item variant="outline" size="sm" class="border-primary/10 bg-card shadow-sm">
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
									aria-label="ゴールの選択を解除"
									onclick={() => (endDestination = null)}
									class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								>
									<X />
								</Button>
							</Item.ItemActions>
						</Item.Item>
					</Item.ItemGroup>
				</div>
			{:else if isGoalOpen}
				<div class="flex flex-col gap-2" transition:fade={{ duration: 150 }}>
					<div class="flex items-center justify-between">
						<Field.FieldLabel for="endDestination">ゴール（宿泊先など）</Field.FieldLabel>
						<Button
							variant="ghost"
							size="icon"
							aria-label="キャンセル"
							onclick={() => (isGoalOpen = false)}
							class="text-muted-foreground"
						>
							<X />
						</Button>
					</div>
					<PlaceCombobox
						id="endDestination"
						label="ゴール（宿泊先など）"
						icon={Flag}
						placeholder="例：新宿グランドホテル..."
						onSelect={(s) => {
							endDestination = { name: s.name, displayAddress: s.displayAddress };
							isGoalOpen = false;
						}}
					/>
				</div>
			{:else}
				<Button
					variant="ghost"
					onclick={() => (isGoalOpen = true)}
					class="w-full justify-start text-muted-foreground"
				>
					<Plus data-icon="inline-start" />
					最後に向かう場所を指定（宿泊先など）
				</Button>
			{/if}
		</section>

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
					作成中...
				{:else}
					<Sparkles data-icon="inline-start" class="animate-pulse" />
					旅行プランを作成する
					<Navigation
						data-icon="inline-end"
						class="rotate-90 transition-transform group-hover:translate-x-1"
					/>
				{/if}
			</Button>
			{#if remainingToGenerate > 0}
				<p class="mt-2 text-center text-xs text-muted-foreground">
					あと {remainingToGenerate} 件追加するとプランを作成できます
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
