/** Every bus event and its payload, in one place, so sender and receiver are checked together. */

export interface EventMap {
	/** A surface hands text (a selection, an output) to the agent panel as context. */
	'agent:attach': { surface: string; label: string; text: string };
	/** Focus the agent composer, opening the panel if needed. */
	'agent:focus': { surface: string };
}
