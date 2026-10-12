import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogDirs, ensureCatalogDirs, loadPlugins, loadRoles, MCP_SCHEMA, parseSkill, PLUGIN_SCHEMA, renderRoles, renderSkills, setCatalogDir } from './catalog.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'catalog-'));
const put = (f: string, s: string) => {
	mkdirSync(join(f, '..'), { recursive: true });
	writeFileSync(f, s);
};

describe('roles', () => {
	test('front matter and body', () => {
		const s = parseSkill('---\nname: Writer\ndescription: "Writes"\n---\n\nDo it.\n', 'w');
		expect(s).toMatchObject({ id: 'w', name: 'Writer', description: 'Writes', body: 'Do it.' });
		expect(parseSkill('Just text', 'x').name).toBe('x');
	});
	test('folders with SKILL.md and loose .md files; others skipped', () => {
		const d = tmp();
		put(join(d, 'researcher', 'SKILL.md'), '---\nname: Researcher\n---\nDig.');
		put(join(d, 'editor.md'), 'Edit.');
		put(join(d, 'notes.txt'), 'no');
		mkdirSync(join(d, 'empty'));
		expect(loadRoles(d).map((r) => r.id)).toEqual(['editor', 'researcher']);
		expect(loadRoles(join(d, 'missing'))).toEqual([]);
	});
	test('renders only resolvable roles', () => {
		const roles = [parseSkill('Dig.', 'r')];
		expect(renderRoles(['r', 'gone'], roles)).toContain('Dig.');
		expect(renderRoles(['gone'], roles)).toBeUndefined();
	});
	test('folders are configurable, defaults under data', () => {
		const root = tmp();
		expect(catalogDirs(root).rolesDir).toBe(join(root, 'roles'));
		expect(setCatalogDir('rolesDir', '/elsewhere', root).rolesDir).toBe('/elsewhere');
		expect(setCatalogDir('rolesDir', '', root).rolesDir).toBe(join(root, 'roles'));
		ensureCatalogDirs(root);
		expect(loadPlugins(join(root, 'plugins'))).toEqual([]);
	});
});

describe('plugins (Agent Plugins 1.0.0)', () => {
	test('manifest, skills and mcp servers', () => {
		const d = tmp();
		const p = join(d, 'reports');
		put(join(p, 'plugin.json'), JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'reports-plugin', version: '1.2.0' }));
		put(join(p, 'skills', 'summarize', 'SKILL.md'), '---\nname: summarize\ndescription: Summarize a report\n---\nSteps.');
		put(join(p, 'mcp.json'), JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: { db: { type: 'stdio', command: './bin/db', args: ['--ro'] }, web: { type: 'streamable-http', url: 'https://x' } } }));
		mkdirSync(join(d, 'not-a-plugin'));
		const [pl] = loadPlugins(d);
		expect(loadPlugins(d).length).toBe(1);
		expect(pl).toMatchObject({ id: 'reports', name: 'reports-plugin', version: '1.2.0', warnings: [] });
		expect(pl!.skills.map((s) => s.id)).toEqual(['summarize']);
		expect(pl!.mcp).toEqual([
			{ name: 'db', type: 'stdio', target: './bin/db --ro' },
			{ name: 'web', type: 'streamable-http', target: 'https://x' }
		]);
		expect(renderSkills(['reports'], [pl!])).toContain('reports/summarize: Summarize a report');
		expect(renderSkills([], [pl!])).toBeUndefined();
	});
	test('a broken mcp.json or manifest warns but keeps skills', () => {
		const d = tmp();
		put(join(d, 'p', 'plugin.json'), '{nope');
		put(join(d, 'p', 'skills', 's', 'SKILL.md'), 'x');
		put(join(d, 'p', 'mcp.json'), 'bad');
		const [pl] = loadPlugins(d);
		expect(pl!.name).toBe('p');
		expect(pl!.skills.length).toBe(1);
		expect(pl!.warnings.length).toBe(3);
	});
});
