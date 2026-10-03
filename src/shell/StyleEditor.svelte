<script lang="ts">
	import { copy_text } from '../kernel/clipboard.ts';
	import { settings } from '../kernel/settings.svelte.ts';
	import { flash } from '../kernel/status.svelte.ts';
	import { as_sass, is_default, reset_style, style, type Accent, type Corners, type Density, type Palette, type Role, type TextStep } from '../kernel/style.svelte.ts';
	import Button from '../ui/Button.svelte';
	import SectionLabel from '../ui/SectionLabel.svelte';
	import Segmented from '../ui/Segmented.svelte';

	// The live style editor (shell-level, in section-sidebar-right on every surface).
	// Each control re-points existing fractalstyler tokens (kernel/style.svelte.ts);
	// App.svelte applies the result through set_css_vars, so changes are instant.
	const TEXT: { value: TextStep; label: string }[] = [
		{ value: 'small', label: 'Small' },
		{ value: 'regular', label: 'Regular' },
		{ value: 'large', label: 'Large' }
	];
	const DENSITY: { value: Density; label: string }[] = [
		{ value: 'tight', label: 'Tight' },
		{ value: 'compact', label: 'Compact' },
		{ value: 'spacious', label: 'Spacious' }
	];
	const CORNERS: { value: Corners; label: string }[] = [
		{ value: 'sharp', label: 'Sharp' },
		{ value: 'soft', label: 'Soft' },
		{ value: 'round', label: 'Round' }
	];
	const ACCENT: { value: Accent; label: string }[] = [
		{ value: 'greenpop', label: 'Green' },
		{ value: 'orangepop', label: 'Orange' },
		{ value: 'fractalstyler', label: 'Theme' }
	];
	const PALETTE: { value: Palette; label: string }[] = [
		{ value: 'app', label: 'App' },
		{ value: 'fractalstyler', label: 'fractalstyler' }
	];
	const ROLES: { role: Role; label: string }[] = [
		{ role: 'surface', label: 'Surfaces' },
		{ role: 'text', label: 'Text' },
		{ role: 'border', label: 'Borders' },
		{ role: 'hover', label: 'Hover' },
		{ role: 'selected', label: 'Selected' }
	];

	function copy_sass() {
		if (copy_text(as_sass(settings.theme))) flash('Copied the style as Sass variables', 'success');
		else flash('Could not reach the clipboard (pbcopy)', 'danger');
	}
</script>

<div class="box gap-lg pad-md" testId="style-editor">
	<div class="box gap-sm">
		<SectionLabel label="Text size" />
		<Segmented options={TEXT} value={style.text} testId="style-text" onchange={(v) => (style.text = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Density" />
		<Segmented options={DENSITY} value={style.density} testId="style-density" onchange={(v) => (style.density = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Corners" />
		<Segmented options={CORNERS} value={style.corners} testId="style-corners" onchange={(v) => (style.corners = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Accent" />
		<Segmented options={ACCENT} value={style.accent} testId="style-accent" onchange={(v) => (style.accent = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Colours" />
		{#each ROLES as r (r.role)}
			<div class="row ycenter xbetween gap-sm">
				<text class="text-sm text-secondary">{r.label}</text>
				<Segmented options={PALETTE} value={style.roles[r.role]} testId={`style-role-${r.role}`} onchange={(v) => (style.roles[r.role] = v)} />
			</div>
		{/each}
	</div>
	<div class="row ycenter gap-sm">
		<Button label="Reset" icon="refresh-cw" active={!is_default()} testId="style-reset" onclick={reset_style} />
		<Button label="Copy as Sass" icon="copy" variant="ghost" testId="style-copy" onclick={copy_sass} />
	</div>
</div>
