<script lang="ts">
	import { settingsPage } from './pages.svelte.ts';
	import GeneralPage from './GeneralPage.svelte';
	import ModelsPage from './ModelsPage.svelte';
	import ShortcutsPage from './ShortcutsPage.svelte';
	import AboutPage from './AboutPage.svelte';
</script>

<div class="box grow min0 pad-md scroll-y" testId="surface-settings-body">
	{#if settingsPage.page === 'general'}
		<GeneralPage />
	{:else if settingsPage.page === 'models'}
		<ModelsPage />
	{:else if settingsPage.page === 'shortcuts'}
		<ShortcutsPage />
	{:else}
		<AboutPage />
	{/if}
</div>
