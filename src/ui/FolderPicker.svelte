<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import Modal from './Modal.svelte';
	import { checkDirInput, dirName, homeDir, listDirs, parentDir, segments } from '../kernel/folders.ts';

	// In-app folder browser: the `pickFolder()` indirection made concrete.
	// The native `NSOpenPanel` call (`remorses/gpuix#82`) swaps in behind
	// these same props (`initial`, `onchoose`, `onclose`) without touching
	// callers. Lists directories only (dotfiles hidden), capped per F25.
	let {
		initial,
		title = 'Choose folder',
		onchoose,
		onclose,
		testId = 'folder-picker'
	}: {
		initial?: string;
		title?: string;
		onchoose: (path: string) => void;
		onclose: () => void;
		testId?: string;
	} = $props();

	const ROW_LIMIT = 100;

	let cwd = $state(initial ?? homeDir());
	let jump = $state('');
	let error = $state<string | null>(null);

	const listing = $derived(listDirs(cwd));
	const shown = $derived(listing.entries.slice(0, ROW_LIMIT));
	const crumbs = $derived(segments(cwd));

	function go(path: string) {
		cwd = path;
		error = listDirs(cwd).error;
	}

	function goJump() {
		const checked = checkDirInput(jump);
		if (checked.error) {
			error = checked.error;
			return;
		}
		jump = '';
		error = null;
		cwd = checked.path;
	}

	const tid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-');
</script>

<Modal {title} {onclose} {testId}>
	<div class="box gap-sm grow min0">
		<div class="row ycenter gap-xs scroll-x" testId={`${testId}-crumbs`}>
			{#each crumbs as c, i (c.path)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<text
					class="text-sm shrink-0"
					class:text-primary={i === crumbs.length - 1}
					class:text-muted={i !== crumbs.length - 1}
					hitbox="self"
					testId={`${testId}-seg-${i}`}
					onclick={() => go(c.path)}
				>{c.label}</text>
				{#if i < crumbs.length - 1}<text class="text-xs text-muted shrink-0">/</text>{/if}
			{/each}
		</div>
		<text class="text-xs text-muted truncate" testId={`${testId}-cwd`}>{cwd}</text>
		<div class="box gap-xs scroll-y wb-palette-list">
			<div class="row ycenter gap-sm">
				<IconButton icon="chevron-up" testId={`${testId}-up`} onclick={() => go(parentDir(cwd))} />
				<text class="text-sm text-secondary">Up to {dirName(parentDir(cwd))}</text>
			</div>
			{#each shown as e (e.path)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="wb-palette-item box gap-xs px-sm radius-sm"
					hitbox="self"
					testId={`${testId}-row-${tid(e.name)}`}
					onclick={() => go(e.path)}
				>
					<div class="row ycenter gap-sm">
						<Icon name="folder" tone="secondary" />
						<text class="grow min0 truncate text-sm text-primary">{e.name}</text>
					</div>
				</div>
			{:else}
				{#if !listing.error}<text class="text-sm text-muted">No subfolders here.</text>{/if}
			{/each}
			{#if listing.entries.length > shown.length}
				<text class="text-xs text-muted">…and {listing.entries.length - shown.length} more.</text>
			{/if}
			{#if listing.error ?? error}<text class="text-xs text-danger" testId={`${testId}-error`}>{listing.error ?? error}</text>{/if}
		</div>
		<div class="row ycenter gap-xs">
			<input
				class="input grow min0"
				testId={`${testId}-input`}
				placeholder="Or type an absolute path…"
				value={jump}
				onchange={(e: { value: string }) => (jump = e.value)}
				onsubmit={goJump}
			/>
			<Button label="Go" variant="ghost" testId={`${testId}-go`} onclick={goJump} />
		</div>
		<div class="row ycenter gap-xs">
			<div class="grow"></div>
			<Button label="Cancel" variant="ghost" testId={`${testId}-cancel`} onclick={onclose} />
			<Button label={`Choose ${dirName(cwd)}`} variant="primary" testId={`${testId}-choose`} onclick={() => onchoose(cwd)} />
		</div>
	</div>
</Modal>
