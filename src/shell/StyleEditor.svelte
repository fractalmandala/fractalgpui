<script lang="ts">
	import { design } from '../kernel/design.svelte.ts';
	import { AUTO, BUTTON_SLOTS, RADIUS_CHOICES, SIZE_SLOTS, style, type Accent, type ButtonSlot, type Corners, type Density, type Palette, type RadiusRole, type Role, type TextStep } from '../kernel/style.svelte.ts';
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

	// Buttons: which existing token each slot reads ('Auto' = its default source).
	const BUTTONS: { slot: ButtonSlot; label: string }[] = [
		{ slot: 'bg', label: 'Button background' },
		{ slot: 'fg', label: 'Button text' },
		{ slot: 'hover', label: 'Button hover' },
		{ slot: 'primaryBg', label: 'Primary background' },
		{ slot: 'primaryFg', label: 'Primary text' },
		{ slot: 'primaryHover', label: 'Primary hover' }
	];
	const auto = (choices: { value: string; label: string }[]) => [{ value: AUTO, label: 'Auto' }, ...choices];
	// Sizes and radii: labelled by the token's px value (light map; sizes are mode-invariant).
	const px = (name: string) => (design.tokens.light[name] ?? '').replace(/px$/, '').replace(/^9999$/, 'Full');
	const sized = (names: readonly string[]) => auto(names.map((n) => ({ value: n, label: px(n) })));
	const RADII: { role: RadiusRole; label: string }[] = [
		{ role: 'control', label: 'Controls' },
		{ role: 'card', label: 'Cards' },
		{ role: 'pill', label: 'Pills' }
	];

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
	<div class="box gap-sm">
		<SectionLabel label="Buttons" />
		{#each BUTTONS as b (b.slot)}
			<text class="text-xs text-secondary">{b.label}</text>
			<Segmented options={auto(BUTTON_SLOTS[b.slot].choices)} value={style.buttons[b.slot]} testId={`style-btn-${b.slot}`} onchange={(v) => (style.buttons[b.slot] = v)} />
		{/each}
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Button size (overrides Density)" />
		<text class="text-xs text-secondary">Height</text>
		<Segmented options={sized(SIZE_SLOTS.height.choices)} value={style.sizes.height} testId="style-btn-height" onchange={(v) => (style.sizes.height = v)} />
		<text class="text-xs text-secondary">Horizontal padding</text>
		<Segmented options={sized(SIZE_SLOTS.padX.choices)} value={style.sizes.padX} testId="style-btn-padx" onchange={(v) => (style.sizes.padX = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Radius (overrides Corners)" />
		{#each RADII as r (r.role)}
			<text class="text-xs text-secondary">{r.label}</text>
			<Segmented options={sized(RADIUS_CHOICES)} value={style.radii[r.role]} testId={`style-radius-${r.role}`} onchange={(v) => (style.radii[r.role] = v)} />
		{/each}
	</div>
</div>
