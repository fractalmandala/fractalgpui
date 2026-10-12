<script lang="ts">
	import { readFileSync } from 'node:fs';
	import { join } from 'node:path';
	import { fileURLToPath } from 'node:url';
	import Button from '../../ui/Button.svelte';
	import { data_dir } from '../../kernel/paths.ts';
	import { revealPath } from '../../kernel/reveal.ts';

	// About (§9.5): app version, storage location + reveal, runtime versions.
	// Versions read from the installed manifests at render; 'unknown' when the
	// files are not where a source checkout keeps them.
	function manifestVersion(dir: string): string {
		try {
			const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: unknown };
			return typeof parsed.version === 'string' ? parsed.version : 'unknown';
		} catch {
			return 'unknown';
		}
	}

	const root = fileURLToPath(new URL('../../..', import.meta.url));
	const appVersion = manifestVersion(root);
	const modelVersion = manifestVersion(join(root, 'node_modules', '@earendil-works', 'pi-ai'));
	const bunVersion = (globalThis as { Bun?: { version?: string } }).Bun?.version ?? 'unknown';
</script>

<div class="box gap-md" testId="set-about">
	<text class="text-lg weight-600 text-primary">About</text>
	<div class="box gap-xs px-sm">
		<text class="text-sm text-primary" testId="about-version">fractalgpui {appVersion}</text>
		<text class="text-sm text-secondary" testId="about-storage">{data_dir()}</text>
		<div class="row ycenter gap-xs">
			<Button label="Reveal storage" testId="about-reveal" onclick={() => revealPath(data_dir())} />
		</div>
		<text class="text-xs text-muted" testId="about-runtime">pi-ai {modelVersion} · bun {bunVersion}</text>
	</div>
</div>
