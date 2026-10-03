/**
 * A minimal typed pub/sub bus for surfaces and panels to talk without widening shared
 * state (borrowed from fractaldesk). Event names and payloads are declared once, in
 * `events.ts`. Subscribing returns an unsubscribe function; nothing is persisted.
 */

import type { EventMap } from './events.ts';

type Handler<T> = (payload: T) => void;

const listeners = new Map<keyof EventMap, Set<Handler<never>>>();

export function on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
	let set = listeners.get(event);
	if (!set) listeners.set(event, (set = new Set()));
	set.add(handler as Handler<never>);
	return () => {
		set.delete(handler as Handler<never>);
		if (set.size === 0) listeners.delete(event);
	};
}

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
	for (const h of listeners.get(event) ?? []) (h as Handler<EventMap[K]>)(payload);
}
