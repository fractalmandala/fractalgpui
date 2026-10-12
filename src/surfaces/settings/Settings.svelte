<script lang="ts">
	import { settingsPage } from './pages.svelte.ts';
	import GeneralPage from './GeneralPage.svelte';
	import ModelsPage from './ModelsPage.svelte';
	import ShortcutsPage from './ShortcutsPage.svelte';
	import AboutPage from './AboutPage.svelte';
	import SettingsSidebar from './SettingsSidebar.svelte';
</script>

<div class="row full min0" testId="surface-settings">
	<div class="box min0 br scroll-y wb-side"><SettingsSidebar /></div>
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
</div>
