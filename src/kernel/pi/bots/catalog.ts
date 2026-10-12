import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { data_dir } from '../../paths.ts';

/**
 * The roles catalog and installed Agent Plugins, read from folders on disk. Nothing is shipped:
 * the user drops files in and the app reads them.
 *
 * Roles   <rolesDir>/<id>/SKILL.md  or  <rolesDir>/<id>.md   (SKILL.md style: YAML-ish front
 *         matter with `name` and `description`, then the instructions). The id is the folder or
 *         file name. A bot's `roles` are ids into this catalog; the body is injected into the
 *         system prompt of the bot's sessions.
 * Plugins <pluginsDir>/<plugin>/plugin.json  (Agent Plugins 1.0.0: required `name`, `$schema`)
 *                              skills/<skill>/SKILL.md   (Agent Skills)
 *                              mcp.json                  ({ $schema, mcpServers: { name: { type, ... } } })
 *         Each component fails on its own: a bad mcp.json never hides the plugin's skills.
 * Folders default to <data>/roles and <data>/plugins; `<data>/catalog.json` may point elsewhere.
 */

export const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

export type SkillDoc = { id: string; name: string; description: string; body: string; file: string };
export type Role = SkillDoc;
export type McpServer = { name: string; type: string; target: string };
export type Plugin = {
	id: string;
	name: string;
	version?: string;
	description?: string;
	dir: string;
	skills: SkillDoc[];
	mcp: McpServer[];
	/** Problems that did not stop loading (shown next to the plugin). */
	warnings: string[];
};
export type CatalogDirs = { rolesDir: string; pluginsDir: string };

const cfgFile = (root: string) => join(root, 'catalog.json');

/** The folders roles and plugins are read from (defaults under the data dir). */
export function catalogDirs(root = data_dir()): CatalogDirs {
	let cfg: Partial<CatalogDirs> = {};
	try {
		cfg = JSON.parse(readFileSync(cfgFile(root), 'utf8'));
	} catch {}
	return {
		rolesDir: typeof cfg.rolesDir === 'string' && cfg.rolesDir ? cfg.rolesDir : join(root, 'roles'),
		pluginsDir: typeof cfg.pluginsDir === 'string' && cfg.pluginsDir ? cfg.pluginsDir : join(root, 'plugins')
	};
}

/** Point the catalog at other folders; an empty string restores the default. */
export function setCatalogDir(kind: keyof CatalogDirs, dir: string, root = data_dir()): CatalogDirs {
	let cfg: Record<string, string> = {};
	try {
		cfg = JSON.parse(readFileSync(cfgFile(root), 'utf8'));
	} catch {}
	if (dir.trim()) cfg[kind] = dir.trim();
	else delete cfg[kind];
	mkdirSync(root, { recursive: true });
	writeFileSync(cfgFile(root), JSON.stringify(cfg, null, 2));
	return catalogDirs(root);
}

/** Create the default folders so the user has somewhere to drop files (idempotent). */
export function ensureCatalogDirs(root = data_dir()): CatalogDirs {
	const d = catalogDirs(root);
	for (const dir of [d.rolesDir, d.pluginsDir]) {
		try {
			mkdirSync(dir, { recursive: true });
		} catch {}
	}
	return d;
}

/** Split SKILL.md front matter (simple `key: value` lines) from the body. */
export function parseSkill(text: string, fallbackId: string, file = ''): SkillDoc {
	const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
	const meta: Record<string, string> = {};
	let body = src;
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
	if (m) {
		body = src.slice(m[0].length);
		for (const line of m[1]!.split('\n')) {
			const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
			if (kv) meta[kv[1]!] = kv[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
		}
	}
	return { id: fallbackId, name: meta.name || fallbackId, description: meta.description || '', body: body.trim(), file };
}

const isDir = (p: string) => {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
};
const list = (dir: string) => {
	try {
		return readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
	} catch {
		return [];
	}
};

/** Every role template in the folder; unreadable entries are skipped. */
export function loadRoles(dir: string): Role[] {
	const out: Role[] = [];
	for (const n of list(dir)) {
		const p = join(dir, n);
		let file = '';
		let id = n;
		if (isDir(p)) {
			file = ['SKILL.md', 'skill.md'].map((f) => join(p, f)).find((f) => existsSync(f)) ?? '';
		} else if (n.toLowerCase().endsWith('.md')) {
			file = p;
			id = n.slice(0, -3);
		}
		if (!file) continue;
		try {
			out.push(parseSkill(readFileSync(file, 'utf8'), id, file));
		} catch {}
	}
	return out;
}

function loadSkills(dir: string): SkillDoc[] {
	const out: SkillDoc[] = [];
	for (const n of list(join(dir, 'skills'))) {
		const f = join(dir, 'skills', n, 'SKILL.md');
		if (!existsSync(f)) continue;
		try {
			out.push(parseSkill(readFileSync(f, 'utf8'), n, f));
		} catch {}
	}
	return out;
}

function loadMcp(dir: string, warnings: string[]): McpServer[] {
	const f = join(dir, 'mcp.json');
	if (!existsSync(f)) return [];
	try {
		const j = JSON.parse(readFileSync(f, 'utf8'));
		if (j.$schema !== MCP_SCHEMA) warnings.push('mcp.json: unexpected $schema');
		const servers = j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {};
		return Object.entries(servers as Record<string, Record<string, unknown>>).map(([name, s]) => ({
			name,
			type: String(s?.type ?? 'unknown'),
			target: String(s?.url ?? [s?.command, ...((s?.args as string[]) ?? [])].filter(Boolean).join(' '))
		}));
	} catch (e) {
		warnings.push(`mcp.json: ${(e as Error).message}`);
		return [];
	}
}

/** Every plugin folder (one with a plugin.json); a broken manifest is reported, not thrown. */
export function loadPlugins(dir: string): Plugin[] {
	const out: Plugin[] = [];
	for (const n of list(dir)) {
		const p = join(dir, n);
		if (!isDir(p) || !existsSync(join(p, 'plugin.json'))) continue;
		const warnings: string[] = [];
		let manifest: Record<string, unknown> = {};
		try {
			manifest = JSON.parse(readFileSync(join(p, 'plugin.json'), 'utf8'));
		} catch (e) {
			warnings.push(`plugin.json: ${(e as Error).message}`);
		}
		if (manifest.$schema !== PLUGIN_SCHEMA) warnings.push('plugin.json: missing or unexpected $schema (expected Agent Plugins 1.0.0)');
		const name = typeof manifest.name === 'string' && manifest.name ? manifest.name : basename(p);
		out.push({
			id: n,
			name,
			...(typeof manifest.version === 'string' ? { version: manifest.version } : {}),
			...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
			dir: p,
			skills: loadSkills(p),
			mcp: loadMcp(p, warnings),
			warnings
		});
	}
	return out;
}

/** The role instructions a bot holds, as one prompt section (undefined when none resolve). */
export function renderRoles(ids: string[], roles: Role[]): string | undefined {
	const byId = new Map(roles.map((r) => [r.id, r]));
	const parts = ids.map((id) => byId.get(id)).filter((r): r is Role => !!r && !!r.body);
	if (!parts.length) return undefined;
	return `<roles>\nYou hold these roles. Follow their instructions.\n${parts.map((r) => `<role id="${r.id}" name="${r.name}">\n${r.body}\n</role>`).join('\n')}\n</roles>`;
}

/** The skills of a bot's enabled plugins, listed so the model can load one with `skill_read`. */
export function renderSkills(enabled: string[], plugins: Plugin[]): string | undefined {
	const on = plugins.filter((p) => enabled.includes(p.id) && p.skills.length);
	if (!on.length) return undefined;
	const lines = on.flatMap((p) => p.skills.map((s) => `- ${p.id}/${s.id}: ${s.description || s.name}`));
	return `<skills>\nSkills you can use. Before using one, read its full instructions with skill_read({ plugin, skill }).\n${lines.join('\n')}\n</skills>`;
}
