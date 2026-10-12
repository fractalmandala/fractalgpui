import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { compile } from 'svelte/compiler';
import { react_to_svelte, ReactConvertError, type ConvertedFile } from '../src/surfaces/tools/react-to-svelte/lib/index.ts';

const DEFAULT_EXTENSIONS = new Set(['.jsx', '.tsx']);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.ts']);
const TYPESCRIPT_MODULE_EXTENSIONS = new Set(['.js', '.mjs', '.jsx', '.tsx', '.ts']);
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage']);

type Options = {
	input: string;
	output: string;
	overwrite: boolean;
	dry_run: boolean;
	extensions: Set<string>;
};

type Artifact = {
	source: string;
	target: string;
	code: string;
	kind: 'component' | 'module';
};

function has_jsx_component(code: string): boolean {
	try {
		const ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'], errorRecovery: false });
		let found = false;
		t.traverseFast(ast, (node) => {
			if (t.isJSXElement(node) || t.isJSXFragment(node)) found = true;
		});
		return found;
	} catch {
		return false;
	}
}

function rewrite_module_extensions(code: string): string {
	return code.replace(/(['"])(\.{1,2}\/[^'"]+)\.(?:m?js|jsx|tsx)\1/g, '$1$2.ts$1');
}

function module_target(output: string, root: string, source: string): string {
	const name = source.replace(/^.*[\\/]/, '').replace(/\.(?:m?js|jsx|tsx|ts)$/i, '.ts');
	return join(output, dirname(relative(root, source)), name);
}

type Failure = {
	source: string;
	message: string;
	line: number | null;
};

function usage(): string {
	return [
		'Usage:',
		'  bun run convert:react -- <react-folder> <svelte-folder> [options]',
		'',
		'Options:',
		'  --include-js  Also scan .js, .mjs, and .ts files; non-React modules become .ts',
		'  --overwrite   Replace existing .svelte and .ts files',
		'  --dry-run     Convert and report without writing files',
		'  --help        Show this help'
	].join('\n');
}

function parse_options(argv: string[]): Options | null {
	const positional: string[] = [];
	let include_js = false;
	let overwrite = false;
	let dry_run = false;
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			console.log(usage());
			return null;
		}
		if (arg === '--include-js') {
			include_js = true;
			continue;
		}
		if (arg === '--overwrite') {
			overwrite = true;
			continue;
		}
		if (arg === '--dry-run') {
			dry_run = true;
			continue;
		}
		if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
		positional.push(arg);
	}
	if (positional.length !== 2) throw new Error(`Expected an input and output folder\n\n${usage()}`);
	const extensions = new Set(DEFAULT_EXTENSIONS);
	if (include_js) for (const extension of JAVASCRIPT_EXTENSIONS) extensions.add(extension);
	return { input: resolve(positional[0]), output: resolve(positional[1]), overwrite, dry_run, extensions };
}

async function collect_sources(root: string, output: string, extensions: Set<string>): Promise<string[]> {
	const sources: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIRECTORIES.has(entry.name) || path === output) continue;
				await visit(path);
				continue;
			}
			if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) sources.push(path);
		}
	};
	await visit(root);
	return sources;
}

function relative_name(root: string, path: string): string {
	const name = relative(root, path);
	return name || path;
}

function target_for(output: string, root: string, source: string, file: ConvertedFile): string {
	if (isAbsolute(file.name) || file.name !== file.name.split('/').pop() || extname(file.name).toLowerCase() !== '.svelte') {
		throw new Error(`converter returned an unsafe output name: ${file.name}`);
	}
	return join(output, dirname(relative(root, source)), file.name);
}

async function main(): Promise<void> {
	const options = parse_options(process.argv.slice(2));
	if (!options) return;
	if (!existsSync(options.input)) throw new Error(`Input folder does not exist: ${options.input}`);
	if (options.input === options.output) throw new Error('Input and output folders must be different');
	const sources = await collect_sources(options.input, options.output, options.extensions);
	if (!sources.length) throw new Error(`No ${[...options.extensions].join('/')} files found under ${options.input}`);

	const artifacts: Artifact[] = [];
	const failures: Failure[] = [];
	for (const source of sources) {
		try {
			const code = await readFile(source, 'utf8');
			const extension = extname(source).toLowerCase();
			if (TYPESCRIPT_MODULE_EXTENSIONS.has(extension) && !has_jsx_component(code)) {
				artifacts.push({ source, target: module_target(options.output, options.input, source), code: rewrite_module_extensions(code), kind: 'module' });
				continue;
			}
			const result = react_to_svelte(code);
			const source_base = basename(source).replace(/\.(?:jsx|tsx|js|ts)$/i, '');
			const source_artifacts = result.files.map((file, index) => {
				const generated = rewrite_module_extensions(file.code);
				compile(generated, { filename: file.name, generate: 'client' });
				const output_file = index === 0 ? { ...file, name: `${source_base}.svelte` } : file;
				return { source, target: target_for(options.output, options.input, source, output_file), code: generated, kind: 'component' as const };
			});
			artifacts.push(...source_artifacts);
			for (const warning of result.warnings) console.warn(`[warn] ${relative_name(options.input, source)}: ${warning}`);
		} catch (error) {
			const convert_error = error instanceof ReactConvertError ? error : null;
			failures.push({
				source,
				message: String(convert_error?.message ?? (error as Error)?.message ?? error),
				line: convert_error?.line ?? null
			});
		}
	}

	const targets = new Map<string, string>();
	const collisions: string[] = [];
	for (const artifact of artifacts) {
		const previous = targets.get(artifact.target);
		if (previous && previous !== artifact.source) collisions.push(`${artifact.target} (${previous} and ${artifact.source})`);
		targets.set(artifact.target, artifact.source);
	}
	if (collisions.length) throw new Error(`Output name collisions:\n${collisions.join('\n')}`);
	const existing = artifacts.filter((artifact) => existsSync(artifact.target));
	if (existing.length && !options.overwrite && !options.dry_run) {
		throw new Error(`Refusing to overwrite existing files; rerun with --overwrite:\n${existing.map((artifact) => artifact.target).join('\n')}`);
	}

	if (!options.dry_run) {
		for (const artifact of artifacts) {
			await mkdir(dirname(artifact.target), { recursive: true });
			await writeFile(artifact.target, artifact.code, { encoding: 'utf8', flag: options.overwrite ? 'w' : 'wx' });
		}
	}
	for (const failure of failures) {
		const line = failure.line == null ? '' : `:${failure.line}`;
		console.error(`[error] ${relative_name(options.input, failure.source)}${line}: ${failure.message}`);
	}
	const action = options.dry_run ? 'would write' : 'wrote';
	const components = artifacts.filter((artifact) => artifact.kind === 'component').length;
	const modules = artifacts.length - components;
	console.log(`${action} ${artifacts.length} output file(s) from ${sources.length} source file(s) (${components} Svelte, ${modules} TypeScript)`);
	if (failures.length) {
		console.error(`${failures.length} source file(s) could not be converted`);
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(`[error] ${(error as Error)?.message ?? error}`);
	console.error(usage());
	process.exitCode = 1;
});
