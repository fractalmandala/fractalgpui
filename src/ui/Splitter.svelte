<script lang="ts">
	// A drag handle on a panel's inner edge. GPUI keeps sending the handle `mousemove`
	// (with `pressedButton`) after a press on it, wherever the pointer goes, so the
	// drag needs no window listener. Lives inside the panel (`position: relative`),
	// absolutely placed on the edge that faces the main area.
	let {
		edge,
		width,
		onresize,
		oncommit,
		onreset,
		testId
	}: {
		/** The panel edge it sits on: `right` for the left sidebar, `left` for right ones. */
		edge: 'left' | 'right';
		width: number;
		onresize: (width: number) => void;
		oncommit?: () => void;
		onreset?: () => void;
		testId?: string;
	} = $props();

	let dragging = $state(false);
	let start_x = 0;
	let start_w = 0;

	type Pointer = { x?: number; pressedButton?: number; clickCount?: number };

	function down(e: Pointer) {
		if (e.clickCount === 2 && onreset) return onreset();
		dragging = true;
		start_x = e.x ?? 0;
		start_w = width;
	}

	function move(e: Pointer) {
		if (!dragging) return;
		if (e.pressedButton !== 0) return end(); // released outside the window
		const dx = (e.x ?? start_x) - start_x;
		onresize(edge === 'right' ? start_w + dx : start_w - dx);
	}

	function end() {
		if (!dragging) return;
		dragging = false;
		oncommit?.();
	}
</script>

<div
	class="wb-splitter"
	class:at-left={edge === 'left'}
	class:at-right={edge === 'right'}
	class:dragging
	{testId}
	onmousedown={down}
	onmousemove={move}
	onmouseup={end}
></div>
