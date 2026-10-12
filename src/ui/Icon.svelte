<script lang="ts">
	import { icon_path, type IconName } from './icons.ts';

	// A Lucide icon. GPUI paints `<svg src>` in its own `color`; with none set it takes
	// the nearest ancestor's (but not an ancestor's :hover colour), so pass `tone`
	// when an icon must change with state.
	let {
		name,
		size = 'sm',
		tone = 'inherit'
	}: {
		name: IconName;
		size?: 'sm' | 'md' | 'lg';
		tone?: 'inherit' | 'primary' | 'secondary' | 'muted' | 'accent' | 'on-accent';
	} = $props();
</script>

<svg
	src={icon_path(name)}
	class="wb-icon"
	class:wb-icon-md={size === 'md'}
	class:wb-icon-lg={size === 'lg'}
	class:wb-text-accent={tone === 'accent'}
	class:wb-text-on-accent={tone === 'on-accent'}
></svg>
