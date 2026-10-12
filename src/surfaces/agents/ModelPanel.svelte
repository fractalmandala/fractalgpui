<script lang="ts">
	import { piModels } from '../../kernel/pi/harness.svelte.ts';
	import { isProviderEnabled, keyStatus } from '../../kernel/pi/models.ts';
	import Icon from '../../ui/Icon.svelte';
	import SearchInput from '../../ui/SearchInput.svelte';

	// The model picker (§3.2): searchable, grouped by provider in catalog
	// order, with context sizes and capability glyphs. Disabled providers are
	// hidden (§7.4); unconfigured ones are marked, not hidden (§3.3).
	let {
		provider,
		modelId,
		onselect,
		onclose,
		testId = 'model-panel'
	}: {
		provider: string;
		modelId: string;
		onselect: (provider: string, modelId: string) => void;
		onclose: () => void;
		testId?: string;
	} = $props();

	let query = $state('');
	let highlight = $state(0);

	interface Row {
		provider: string;
		providerName: string;
		unconfigured: boolean;
		id: string;
		name: string;
		context: string;
		images: boolean;
		reasoning: boolean;
		current: boolean;
	}

	function compactSize(tokens: number): string {
		if (tokens >= 1000000) return `${trim(tokens / 1000000)}M`;
		if (tokens >= 1000) return `${trim(tokens / 1000)}K`;
		return String(tokens);
	}

	function trim(n: number): string {
		return String(Math.round(n * 100) / 100);
	}

	function rows(): Row[] {
		const q = query.trim().toLowerCase();
		const out: Row[] = [];
		for (const p of piModels().getProviders()) {
			if (!isProviderEnabled(p.id)) continue;
			let models: { id: string; name?: string; contextWindow?: number; input?: readonly string[]; reasoning?: boolean }[] = [];
			try {
				models = piModels().getModels(p.id) as unknown as typeof models;
			} catch {
				continue;
			}
			const name = p.name ?? p.id;
			const unconfigured = !keyStatus(p.id).ok;
			for (const m of models) {
				const label = m.name ?? m.id;
				if (q && !label.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) continue;
				out.push({
					provider: p.id,
					providerName: name,
					unconfigured,
					id: m.id,
					name: label,
					context: typeof m.contextWindow === 'number' ? compactSize(m.contextWindow) : '—',
					images: m.input?.includes('image') ?? false,
					reasoning: m.reasoning ?? false,
					current: p.id === provider && m.id === modelId
				});
			}
		}
		return out;
	}

	function groupRows(list: Row[]): { heading: string; unconfigured: boolean; rows: Row[] }[] {
		const seen = new Map<string, { heading: string; unconfigured: boolean; rows: Row[] }>();
		for (const r of list) {
			let g = seen.get(r.provider);
			if (!g) {
				g = { heading: r.providerName, unconfigured: r.unconfigured, rows: [] };
				seen.set(r.provider, g);
			}
			g.rows.push(r);
		}
		return [...seen.values()];
	}

	function groups(): { heading: string; unconfigured: boolean; rows: Row[] }[] {
		return groupRows(rows());
	}

	function flat(): Row[] {
		return groups().flatMap((g) => g.rows);
	}

	// Render cap (F25): the native flexbox engine never converges layout on
	// hundreds of rows, wedging the window with the panel open. Render the
	// first slice; typing in Search narrows the catalog. Keyboard nav covers
	// exactly the rendered rows; the footer keeps the real total.
	const ROW_LIMIT = 60;
	const allRows = $derived(flat());
	const visible = $derived(allRows.slice(0, ROW_LIMIT));
	const grouped = $derived(groupRows(visible));

	function key(e: { key?: string }) {
		const k = (e.key ?? '').toLowerCase();
		if (k === 'escape') return onclose();
		if (k === 'arrowdown' || k === 'arrowup') {
			const delta = k === 'arrowdown' ? 1 : -1;
			if (visible.length) highlight = (highlight + delta + visible.length) % visible.length;
			return;
		}
		if (k === 'enter') {
			const row = visible[highlight];
			if (row) onselect(row.provider, row.id);
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-menu box gap-xs" {testId} hitbox="self" autofocus onkeydown={key} onmousedownoutside={onclose}>
	<SearchInput value={query} placeholder="Search models" oninput={(v) => { query = v; highlight = 0; }} testId={`${testId}-search`} focus />
	<div class="box gap-xs scroll-y wb-palette-list">
		{#each grouped as g (g.heading)}
			<div class="px-sm">
				<text class="text-xs text-muted">{g.heading}{#if g.unconfigured} · no key{/if}</text>
			</div>
			{#each g.rows as r, i (r.provider + r.id)}
				<div
					class="wb-palette-item box gap-xs px-sm radius-sm"
					class:active={visible.indexOf(r) === highlight}
					hitbox="self"
					testId={(`${testId}-row-${r.provider}-${r.id}`).replace(/[^a-zA-Z0-9-]/g, '-')}
					onclick={() => onselect(r.provider, r.id)}
					onmouseenter={() => (highlight = visible.indexOf(r))}
				>
					<div class="row ycenter gap-sm">
						<text class="grow min0 truncate text-sm text-primary">{r.name}</text>
						<text class="text-xs text-muted shrink-0">{r.context}</text>
						{#if r.images}<Icon name="eye" tone="secondary" />{/if}
						{#if r.reasoning}<Icon name="brain" tone="secondary" />{/if}
						{#if r.current}<Icon name="check" tone="accent" />{/if}
					</div>
				</div>
			{/each}
		{:else}
			<div class="row ycenter px-sm h-md"><text class="text-sm text-muted">No models match</text></div>
		{/each}
		{#if allRows.length > visible.length}
			<div class="row ycenter px-sm"><text class="text-xs text-muted">…and {allRows.length - visible.length} more — type in Search to narrow.</text></div>
		{/if}
	</div>
	<div class="row ycenter xbetween px-sm">
		<text class="text-xs text-muted">{allRows.length} models · ↹ Navigate · ↵ Select · Esc Close</text>
	</div>
</div>
