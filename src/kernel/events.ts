/** Every bus event and its payload, in one place, so sender and receiver are checked together. */

export interface EventMap {
	/** The active surface changed (sent by `switch_to`). */
	'surface:switch': { from: string; to: string };
}
