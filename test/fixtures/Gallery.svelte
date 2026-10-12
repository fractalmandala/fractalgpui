<script lang="ts">
	// Every src/ui primitive on one page, wired to local state, for test/ui.ts.
	import Button from '../../src/ui/Button.svelte';
	import Card from '../../src/ui/Card.svelte';
	import Icon from '../../src/ui/Icon.svelte';
	import IconButton from '../../src/ui/IconButton.svelte';
	import Pill from '../../src/ui/Pill.svelte';
	import SectionLabel from '../../src/ui/SectionLabel.svelte';
	import Segmented from '../../src/ui/Segmented.svelte';
	import Tabs from '../../src/ui/Tabs.svelte';
	import Toggle from '../../src/ui/Toggle.svelte';

	let { log }: { log: (event: string) => void } = $props();

	let tab = $state('a');
	let seg = $state<'x' | 'y'>('x');
	let on = $state(false);
	let pressed = $state(0);
</script>

<div class="row full bg text-primary sans">
	<div class="box grow min0 gap-sm pad-md">
		<IconButton icon="x" testId="close" onclick={() => log('close')} />
		<Tabs tabs={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', badge: 3 }]} value={tab} onchange={(id) => (tab = id)} />
		<Segmented options={[{ value: 'x', label: 'Ex' }, { value: 'y', label: 'Why' }]} value={seg} onchange={(v) => (seg = v)} />
		<Toggle label="Enabled" checked={on} onchange={(v) => (on = v)} />
		<Button label="Go" variant="primary" testId="go" onclick={() => pressed++} />
		<SectionLabel label="Section" />
		<Pill label="new" tone="accent" />
		<Card onclick={() => log('card')} testId="card"><text>Card body</text></Card>
		<div testId="icon-box"><Icon name="house" /></div>
		<text testId="state">{`${tab} ${seg} ${on} ${pressed}`}</text>
	</div>
</div>
