// API keys as files: <home>/keys/<provider>.key, mode 0600 (folder 0700). A file holds either the key itself or
// a reference to an environment variable (`env:NAME`), so a key you already keep in your shell never gets copied.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { data_dir } from '../paths.ts';

export const keysDir = (root = data_dir()) => join(root, 'keys');

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function fileFor(providerId: string, root: string): string {
	if (!SAFE_ID.test(providerId) || providerId.includes('..')) throw new Error(`"${providerId}" cannot be used as a key file name.`);
	return join(keysDir(root), `${providerId}.key`);
}

export type StoredKey = { kind: 'key'; key: string } | { kind: 'env'; name: string };

function write(file: string, root: string, content: string) {
	mkdirSync(keysDir(root), { recursive: true, mode: 0o700 });
	try {
		chmodSync(keysDir(root), 0o700);
	} catch {
		/* not ours to change */
	}
	writeFileSync(file, `${content}\n`, { mode: 0o600 });
	chmodSync(file, 0o600); // writeFileSync keeps the old mode of an existing file
}

export function writeKeyFile(providerId: string, key: string, root = data_dir()): void {
	const clean = key.trim();
	if (!clean) throw new Error('Paste a key first.');
	if (/[\r\n]/.test(clean)) throw new Error('A key is a single line.');
	if (clean.startsWith('env:')) throw new Error('Use "use an environment variable" to reference one.');
	write(fileFor(providerId, root), root, clean);
}

export function writeEnvRef(providerId: string, envName: string, root = data_dir()): void {
	const name = envName.trim();
	if (!ENV_NAME.test(name)) throw new Error(`"${envName}" is not a valid environment variable name.`);
	write(fileFor(providerId, root), root, `env:${name}`);
}

export function readKeyFile(providerId: string, root = data_dir()): StoredKey | undefined {
	let file: string;
	try {
		file = fileFor(providerId, root);
	} catch {
		return undefined;
	}
	if (!existsSync(file)) return undefined;
	const text = readFileSync(file, 'utf8').trim();
	if (!text) return undefined;
	return text.startsWith('env:') ? { kind: 'env', name: text.slice(4).trim() } : { kind: 'key', key: text };
}

export function deleteKeyFile(providerId: string, root = data_dir()): void {
	try {
		const f = fileFor(providerId, root);
		if (existsSync(f)) unlinkSync(f);
	} catch {
		/* nothing to delete */
	}
}

export function listKeyFiles(root = data_dir()): string[] {
	if (!existsSync(keysDir(root))) return [];
	return readdirSync(keysDir(root)).filter((f) => f.endsWith('.key')).map((f) => f.slice(0, -4));
}

/** The key a stored entry stands for right now (an env reference resolves against `env`); undefined when empty. */
export function resolveStored(s: StoredKey | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
	if (!s) return undefined;
	if (s.kind === 'key') return s.key;
	const v = (env[s.name] ?? '').trim();
	return v || undefined;
}
