<script lang="ts">
	import Icon from '../../ui/Icon.svelte';
	import { settingsPage, type SettingsPage } from './pages.svelte.ts';

	// The Settings page list (§9.2): General, Agent & models, Shortcuts, About.
	const PAGES: { id: SettingsPage; label: string; icon: 'sliders-horizontal' | 'bot' | 'command' | 'info' }[] = [
		{ id: 'general', label: 'General', icon: 'sliders-horizontal' },
		{ id: 'models', label: 'Agent & models', icon: 'bot' },
		{ id: 'shortcuts', label: 'Shortcuts', icon: 'command' },
		{ id: 'about', label: 'About', icon: 'info' }
	];
</script>

<div class="box gap-xs pad-md" testId="set-nav">
	{#each PAGES as p (p.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="wb-row-item row ycenter gap-sm"
			class:active={settingsPage.page === p.id}
			hitbox="self"
			testId={`set-nav-${p.id}`}
			onclick={() => (settingsPage.page = p.id)}
		>
			<Icon name={p.icon} tone="secondary" />
			<text class="nav-section-title grow truncate">{p.label}</text>
		</div>
	{/each}
</div>
