/**
 * The roles catalog and installed plugins as the Bot editor sees them. Read from disk on
 * demand (opening the section, Reload, or changing the folder); nothing is cached in storage.
 */

import { catalogDirs, ensureCatalogDirs, loadPlugins, loadRoles, setCatalogDir, type CatalogDirs, type Plugin, type Role } from '../../kernel/pi/bots/catalog.ts';

export const catalog = $state({ dirs: null as CatalogDirs | null, roles: [] as Role[], plugins: [] as Plugin[], loaded: false });

export function reloadCatalog(): void {
	const dirs = ensureCatalogDirs();
	catalog.dirs = dirs;
	catalog.roles = loadRoles(dirs.rolesDir);
	catalog.plugins = loadPlugins(dirs.pluginsDir);
	catalog.loaded = true;
}

export function ensureCatalog(): void {
	if (!catalog.loaded) reloadCatalog();
}

export function chooseCatalogDir(kind: keyof CatalogDirs, dir: string): void {
	setCatalogDir(kind, dir);
	reloadCatalog();
}

export { catalogDirs };
