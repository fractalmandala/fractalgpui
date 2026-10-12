<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import Toggle from '../../ui/Toggle.svelte';
	import { botList } from '../bots/state.svelte.ts';
	import { attach, browser_prefs, browser_ui, checkPlaywright, close, go, install, launch, setHeaded, shot, shownBot } from './state.svelte.ts';

	// The Browser view: one bot's browser at a time. Status, URL, the last screenshot (a file the bot
	// saved in its media folder), the action log, and controls. A live mirror is not possible without a
	// canvas, so the picture is the last screenshot; "Screenshot" refreshes it.
	const bot = $derived(shownBot());
	$effect(() => {
		attach(bot);
		void checkPlaywright();
	});
	const s = $derived(browser_ui.state);
	const time = (ts: number) => new Date(ts).toLocaleTimeString();
	const headed = $derived(browser_prefs.headed[bot] === true);
	const rows = $derived([...s.log].reverse().slice(0, 40));
</script>

<div class="box gap-md pad-md scroll-y" testId="surface-browser">
	{#if !bot}
		<text class="text-sm text-muted" testId="br-nobot">Create a bot first: every bot has its own browser and profile.</text>
	{:else}
		<div class="row gap-xs wrap">
			{#each botList() as b (b.id)}
				<Button label={b.bot.identity.name} variant={b.id === bot ? 'primary' : 'ghost'} testId={`br-bot-${b.id}`} onclick={() => attach(b.id)} />
			{/each}
		</div>

		{#if browser_ui.playwright === 'no'}
			<div class="box gap-sm" testId="br-missing">
				<text class="text-sm text-primary">The browser engine is not installed yet.</text>
				<text class="text-xs text-muted">Playwright and Chromium (about 150 MB) are installed on demand, into the app's data folder. The rest of the app works without them.</text>
				<div class="row gap-sm">
					<Button label={browser_ui.installing ? 'Installing…' : 'Install browser'} variant="primary" testId="br-install" onclick={() => void install()} />
				</div>
				{#each browser_ui.installLog as l, i (i)}<text class="text-xs text-muted truncate">{l}</text>{/each}
			</div>
		{/if}

		<div class="row ycenter gap-sm">
			<text class="text-xs text-muted shrink-0" testId="br-status">{s.status}{s.status === 'open' ? (s.headed ? ' · visible window' : ' · headless') : ''}</text>
			<text class="text-xs text-secondary grow min0 truncate" testId="br-title">{s.title}</text>
		</div>

		<div class="row gap-sm">
			<input
				class="input grow"
				testId="br-url"
				placeholder="https://…"
				value={browser_ui.url}
				onchange={(e: { value: string }) => (browser_ui.url = e.value)}
				onsubmit={() => void go()}
			/>
			<Button label="Go" variant="primary" testId="br-go" onclick={() => void go()} />
		</div>

		<div class="row ycenter gap-sm wrap">
			{#if s.status === 'open'}
				<Button label="Close browser" testId="br-close" onclick={() => void close()} />
				<Button label="Screenshot" testId="br-shot" onclick={() => void shot()} />
			{:else}
				<Button label={s.status === 'launching' ? 'Launching…' : 'Launch'} testId="br-launch" onclick={() => void launch()} />
			{/if}
			<Toggle checked={headed} label="Visible window" testId="br-headed" onchange={(on) => void setHeaded(on)} />
		</div>
		<text class="text-xs text-muted">The profile (logins, cookies) is kept per bot, so a bot you sign in for stays signed in. With the visible window on, you can take over.</text>

		{#if browser_ui.notice || s.error}
			<text class="text-xs text-danger" testId="br-error">{browser_ui.notice || s.error}</text>
		{/if}

		{#if s.lastShot}
			<img class="wb-shot" src={s.lastShot} testId="br-image" />
			<text class="text-xs text-muted truncate" testId="br-shot-path">{s.lastShot}</text>
		{:else}
			<text class="text-sm text-muted" testId="br-noshot">No screenshot yet.</text>
		{/if}

		<text class="wb-label">Actions</text>
		{#each rows as r, i (r.ts + ':' + i)}
			<div class="row gap-sm" testId={`br-log-${i}`}>
				<text class="text-xs text-muted shrink-0">{time(r.ts)}</text>
				<text class="text-xs shrink-0" class:text-danger={!r.ok} class:text-secondary={r.ok}>{r.action}</text>
				<text class="text-xs text-primary grow min0 truncate">{r.detail}</text>
			</div>
		{:else}
			<text class="text-sm text-muted" testId="br-nolog">Nothing yet.</text>
		{/each}
	{/if}
</div>
