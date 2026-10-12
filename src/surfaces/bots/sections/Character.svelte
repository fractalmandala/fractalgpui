<script lang="ts">
	import { characterOptions } from '../../../kernel/pi/bots/personality.ts';
	import Segmented from '../../../ui/Segmented.svelte';
	import Field from '../Field.svelte';
	import { editor } from '../state.svelte.ts';

	// Tone, verbosity, traits, how to address you, free notes. The bot may also edit these
	// itself when "Agent may edit its character" is on (Capabilities).
	const options = characterOptions();
	const tones = options.tones.map((t) => ({ value: t, label: t }));
	const verbosities = options.verbosities.map((t) => ({ value: t, label: t }));
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-character">
		<div class="box gap-xs">
			<text class="wb-label">Tone</text>
			<Segmented options={tones} value={editor.draft.tone} testId="ch-tone" onchange={(v) => editor.draft && (editor.draft.tone = v)} />
		</div>
		<div class="box gap-xs">
			<text class="wb-label">Verbosity</text>
			<Segmented options={verbosities} value={editor.draft.verbosity} testId="ch-verbosity" onchange={(v) => editor.draft && (editor.draft.verbosity = v)} />
		</div>
		<Field label="Traits" hint="Comma-separated, e.g. curious, careful" testId="ch-traits" value={editor.draft.traits} onchange={(v) => editor.draft && (editor.draft.traits = v)} />
		<Field label="Address you as" testId="ch-address" value={editor.draft.addressUserAs} onchange={(v) => editor.draft && (editor.draft.addressUserAs = v)} />
		<Field label="Notes" rows={4} testId="ch-notes" value={editor.draft.notes} onchange={(v) => editor.draft && (editor.draft.notes = v)} />
	</div>
{/if}
