<script lang="ts">
	import { appFxBag, convertUsd, createFx, formatInr, type FxStatus } from '../../kernel/pi/fx.ts';
	import type { AgentChat } from './session.svelte.ts';

	// The usage popover (§4.2): context figures, speed, provider usage with the
	// INR cost and the stated rate, tool context. Rows with no data are absent
	// rather than zero-filled (§4.3).
	let { chat, onclose, testId = 'usage' }: { chat: AgentChat; onclose: () => void; testId?: string } = $props();

	const fx = createFx(appFxBag());
	let rate = $state<FxStatus>(fx.status());

	$effect(() => {
		void fx.refresh().then((s) => (rate = s));
	});

	const snap = () => chat.usageSnapshot();
	const num = (n: number) => n.toLocaleString('en-US');
	const pct = (p: number) => `${Math.round(p * 10) / 10}%`;
	const dash = (n: number | null) => (n === null ? '—' : num(n));

	const rateLine = () => {
		const at = rate.fetchedAt ? new Date(rate.fetchedAt).toLocaleString() : '';
		if (rate.source === 'live') return `live rate $1 = ₹${rate.rate}${at ? ` · ${at}` : ''}`;
		if (rate.source === 'cached') return `cached rate $1 = ₹${rate.rate}${at ? ` · ${at}` : ''}`;
		return `bundled fallback rate $1 = ₹${rate.rate}`;
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-menu box gap-md pad-sm" {testId} hitbox="self" autofocus onkeydown={(e: { key?: string }) => { if ((e.key ?? '').toLowerCase() === 'escape') onclose(); }} onmousedownoutside={onclose}>
	{#if chat.rows}{@const s = snap()}
	{#if s.context}
		<div class="row ycenter xbetween gap-sm px-sm">
			<text class="text-md weight-600 text-primary">{num(s.context.left)} tokens left</text>
			<text class="text-sm text-secondary">{pct(100 - s.context.percent)}</text>
		</div>
		<div class="box gap-xs px-sm">
			<text class="text-xs text-muted">Context window</text>
			<text class="text-sm text-primary">{num(s.context.used)} of {num(s.context.total)} · {pct(s.context.percent)} used</text>
			<text class="text-sm text-primary">This turn: {num(s.context.thisTurn)}</text>
			{#if s.speed !== null}<text class="text-sm text-primary">Generation speed: {Math.round(s.speed * 10) / 10} tok/s</text>{/if}
		</div>
	{/if}
	{#if s.provider.hasRun}
		<div class="box gap-xs px-sm">
			<text class="text-xs text-muted">Provider usage</text>
			<text class="text-sm text-primary">In {num(s.provider.input)} · out {num(s.provider.output)} · cache {dash(s.provider.cacheRead)}</text>
			<text class="text-sm text-primary">
				Cache hit {s.provider.cacheHitRate === null ? '—' : pct(s.provider.cacheHitRate * 100)} · reasoning {dash(s.provider.reasoning)}
			</text>
			<text class="text-sm text-primary" testId={`${testId}-cost`}>Cost {formatInr(convertUsd(s.provider.costUsd, rate).inr)}</text>
			<text class="text-xs text-muted">{rateLine()}</text>
		</div>
	{/if}
	{#if s.tools.hasRecordings}
		<div class="box gap-xs px-sm">
			<text class="text-xs text-muted">Tool context</text>
			<text class="text-sm text-primary">{s.tools.names.length} tools · {s.calls} calls · {num(s.tools.tokens)} tokens</text>
		</div>
	{/if}
	{/if}
</div>
