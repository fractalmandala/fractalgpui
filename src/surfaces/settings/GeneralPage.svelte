<script lang="ts">
	import Toggle from '../../ui/Toggle.svelte';
	import { settings, toggle_theme } from '../../kernel/settings.svelte.ts';
</script>

<div class="box gap-md" testId="set-general">
	<text class="text-lg weight-600 text-primary">General</text>
	<Toggle label="Dark theme" checked={settings.theme === 'dark'} testId="set-theme" onchange={() => toggle_theme()} />
</div>
