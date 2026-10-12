// Tier-2 memory: a SMALL always-present profile (facts and preferences that must never be summarized away).
// Pure operations on a bot's `profile`; the extension persists them in the bot doc and audits each change.
import type { Actor, Profile } from './meta.ts';

export const MAX_ENTRIES = 40;
export const MAX_PROPOSALS = 20;
export const MAX_KEY = 40;
export const MAX_TEXT = 300;
export const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export const entryBytes = (e: { key: string; text: string }) => Buffer.byteLength(e.key) + Buffer.byteLength(e.text) + 4;
export const profileBytes = (p: Profile) => p.entries.reduce((n, e) => n + entryBytes(e), 0);

function checkEntry(key: string, text: string): void {
	if (!KEY_RE.test(key) || key.length > MAX_KEY) throw new Error(`Invalid key "${key.slice(0, 50)}": use letters, digits, _ . - (max ${MAX_KEY}).`);
	if (!text.trim()) throw new Error('The entry text is empty.');
	if (text.length > MAX_TEXT) throw new Error(`Entry text is ${text.length} chars; the limit is ${MAX_TEXT}. Shorten it.`);
	if (/[\r\n]/.test(text)) throw new Error('Entries are one line; remove line breaks.');
}

/** Set (add or replace) an entry. Throws when the profile would exceed its cap. */
export function setEntry(p: Profile, capBytes: number, key: string, text: string, by: Actor, now: number): string {
	checkEntry(key, text);
	const next = { key, text: text.trim(), ts: now, by };
	const i = p.entries.findIndex((e) => e.key === key);
	if (i < 0 && p.entries.length >= MAX_ENTRIES) throw new Error(`The profile already has ${MAX_ENTRIES} entries; remove one first.`);
	const used = profileBytes(p) - (i >= 0 ? entryBytes(p.entries[i]!) : 0) + entryBytes(next);
	if (used > capBytes) throw new Error(`The profile is full: ${used} of ${capBytes} bytes would be used. Remove or shorten entries first.`);
	if (i >= 0) p.entries[i] = next;
	else p.entries.push(next);
	return `${i >= 0 ? 'updated' : 'added'} ${key}`;
}

export function removeEntry(p: Profile, key: string): string {
	const i = p.entries.findIndex((e) => e.key === key);
	if (i < 0) throw new Error(`No profile entry "${key}".`);
	p.entries.splice(i, 1);
	return `removed ${key}`;
}

export function propose(p: Profile, key: string, text: string, reason: string, now: number): string {
	checkEntry(key, text);
	if (p.proposals.length >= MAX_PROPOSALS) throw new Error(`There are already ${MAX_PROPOSALS} pending proposals; wait for the user to review them.`);
	const dup = p.proposals.find((q) => q.key === key);
	if (dup) {
		dup.text = text.trim();
		dup.reason = reason.slice(0, 200);
		dup.ts = now;
		return `proposal for ${key} replaced`;
	}
	p.proposals.push({ id: p.nextId++, key, text: text.trim(), reason: reason.slice(0, 200), ts: now });
	return `proposed ${key}`;
}

export function resolveProposal(p: Profile, capBytes: number, id: number, accept: boolean, now: number): string {
	const i = p.proposals.findIndex((q) => q.id === id);
	if (i < 0) throw new Error(`No proposal #${id}.`);
	const q = p.proposals[i]!;
	if (accept) setEntry(p, capBytes, q.key, q.text, 'agent', now); // throws (and keeps the proposal) when full
	p.proposals.splice(i, 1);
	return `${accept ? 'accepted' : 'rejected'} proposal ${q.key}`;
}

export function renderProfile(p: Profile | undefined): string | undefined {
	if (!p || !p.entries.length) return undefined;
	return p.entries.map((e) => `- ${e.key}: ${e.text}`).join('\n');
}
