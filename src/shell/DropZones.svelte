<script lang="ts">
	import { drop, ui } from '../kernel/dock/dock.svelte.ts';
	import type { Zone } from '../kernel/dock/tree.ts';

	// Covers a pane's body while a tab is dragged: four edge strips (split here) around a centre
	// (add as a tab). The hovered zone is tinted; releasing over one drops there.
	let { group }: { group: string } = $props();

	const over = (z: Zone) => ui.over === `${group}:${z}`;
</script>

<div class="wb-dropzones box" testId={`drops-${group}`}>
	<div class="box grow wb-drop-zone" class:over={over('top')} hitbox="self" testId={`drop-${group}-top`} onmouseenter={() => (ui.over = `${group}:top`)} onmouseup={() => drop(group, 'top')}></div>
	<div class="row wb-grow-2">
		<div class="box grow wb-drop-zone" class:over={over('left')} hitbox="self" testId={`drop-${group}-left`} onmouseenter={() => (ui.over = `${group}:left`)} onmouseup={() => drop(group, 'left')}></div>
		<div class="box wb-grow-2 wb-drop-zone" class:over={over('center')} hitbox="self" testId={`drop-${group}-center`} onmouseenter={() => (ui.over = `${group}:center`)} onmouseup={() => drop(group, 'center')}></div>
		<div class="box grow wb-drop-zone" class:over={over('right')} hitbox="self" testId={`drop-${group}-right`} onmouseenter={() => (ui.over = `${group}:right`)} onmouseup={() => drop(group, 'right')}></div>
	</div>
	<div class="box grow wb-drop-zone" class:over={over('bottom')} hitbox="self" testId={`drop-${group}-bottom`} onmouseenter={() => (ui.over = `${group}:bottom`)} onmouseup={() => drop(group, 'bottom')}></div>
</div>
