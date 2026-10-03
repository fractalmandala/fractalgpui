import { describe, expect, test } from 'bun:test';
import { compileString } from 'sass';
import { css_to_sass, CssParseError, parse, split_parts } from './index.ts';

/** The oracle: the Sass we emit must compile to exactly what Sass makes of the CSS itself. */
function same_css(css: string, opts = {}) {
	const { sass } = css_to_sass(css, opts);
	const from_css = compileString(css, { syntax: 'css', style: 'expanded' }).css;
	const from_sass = compileString(sass, { syntax: 'indented', style: 'expanded' }).css;
	// Silent comments are dropped by design; compare with loud comments stripped too.
	const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/ ;/g, ';').trim();
	expect(strip(from_sass)).toBe(strip(from_css));
	return sass;
}

describe('declarations and rules', () => {
	test('a flat rule becomes an indented block', () => {
		expect(css_to_sass('.a { color: red; padding: 1px 2px }').sass).toBe('.a\n\tcolor: red\n\tpadding: 1px 2px\n');
	});

	test('!important, custom properties and multi-line values', () => {
		const sass = same_css(`.a { color: red !important; --gap:  4px ;
			grid-template-areas: "a b"
			                     "c d"; }`);
		expect(sass).toContain('color: red !important');
		expect(sass).toContain('--gap: 4px');
		expect(sass).toContain('grid-template-areas: "a b" "c d"');
	});

	test('strings and data URIs with ; { } inside survive', () => {
		same_css(`.a { content: "a;b{c}"; background: url(data:image/svg+xml;utf8,<svg></svg>) }`);
	});

	test('indent option', () => {
		expect(css_to_sass('.a{color:red}', { indent: '  ' }).sass).toBe('.a\n  color: red\n');
	});

	test('empty rules are dropped', () => {
		expect(css_to_sass('.a {} .b { color: red }').sass).toBe('.b\n\tcolor: red\n');
	});
});

describe('nesting', () => {
	test('pseudo-classes and compound classes nest with &', () => {
		const sass = same_css('.btn{color:red}.btn:hover{color:blue}.btn.primary{color:green}.btn.primary:hover{color:lime}');
		expect(sass).toBe('.btn\n\tcolor: red\n\t&:hover\n\t\tcolor: blue\n\t&.primary\n\t\tcolor: green\n\t\t&:hover\n\t\t\tcolor: lime\n');
	});

	test('descendants and child combinators nest', () => {
		const sass = same_css('.card{padding:1px}.card .title{margin:0}.card > .body{margin:1px}');
		expect(sass).toContain('.card\n\tpadding: 1px\n\t.title\n\t\tmargin: 0\n\t& > .body');
	});

	test('a shared prefix opens an empty parent only when the next rule shares it', () => {
		expect(same_css('.nav a{color:red}.nav a:hover{color:blue}')).toBe('.nav\n\ta\n\t\tcolor: red\n\t\t&:hover\n\t\t\tcolor: blue\n');
		expect(same_css('.nav a{color:red}.x{color:blue}')).toBe('.nav a\n\tcolor: red\n\n.x\n\tcolor: blue\n');
	});

	test('order is preserved: no nesting across an unrelated rule', () => {
		// Hoisting `.a:hover` into the first `.a` would move it above `.b`.
		const css = '.a{color:red}.b{color:blue}.a:hover{color:green}';
		const sass = same_css(css);
		expect(sass).toContain('\n.a:hover\n');
	});

	test('a repeated selector right after itself merges', () => {
		// Equivalent CSS (same declarations, same order), so compare against the merged form.
		const sass = css_to_sass('.a{color:red}.a{margin:0}').sass;
		expect(sass).toBe('.a\n\tcolor: red\n\tmargin: 0\n');
		expect(compileString(sass, { syntax: 'indented' }).css).toBe('.a {\n  color: red;\n  margin: 0;\n}');
	});

	test('a repeated selector after a nested child does not merge (cascade)', () => {
		const sass = same_css('.a{color:red}.a:hover{color:blue}.a{color:green}');
		expect(sass.match(/^\.a$/gm)?.length).toBe(2);
	});

	test('selector lists nest when every member shares the prefix', () => {
		expect(same_css('.card .t,.card .s{margin:0}.card .t{color:red}')).toContain('.card\n\t.t, .s\n\t\tmargin: 0\n\t.t\n\t\tcolor: red');
	});

	test('sibling combinators and nested pseudo-element', () => {
		const sass = same_css('.a{color:red}.a + .b{color:blue}.a ~ .c{color:green}.a::before{content:""}.a :focus{outline:0}');
		expect(sass).toContain('& + .b');
		expect(sass).toContain('& ~ .c');
		expect(sass).toContain('&::before');
		// A nested line starting with `:` would read as a property in the indented syntax.
		expect(sass).toContain('& :focus');
	});

	test('attribute selectors and :is()/:not() with spaces stay whole', () => {
		expect(split_parts('a[title="x y"]:not(.a .b) > b').map((p) => p.text)).toEqual(['a', '[title="x y"]', ':not(.a .b)', 'b']);
		same_css('a[title="x y"]{color:red}a[title="x y"]:not(.a .b){color:blue}');
	});

	test('nest: false keeps every selector flat', () => {
		expect(css_to_sass('.a{color:red}.a:hover{color:blue}', { nest: false }).sass).toBe('.a\n\tcolor: red\n\n.a:hover\n\tcolor: blue\n');
	});

	test('native CSS nesting input is kept', () => {
		const sass = css_to_sass('.a{color:red; &:hover{color:blue} .b{margin:0}}').sass;
		// Sass passes native nesting through untouched in CSS mode, so compare with the flat form.
		const flat = compileString(sass, { syntax: 'indented' }).css.replace(/\s+/g, ' ');
		expect(flat).toBe('.a { color: red; } .a:hover { color: blue; } .a .b { margin: 0; }');
		expect(sass).toContain('\t&:hover\n\t\tcolor: blue');
		expect(sass).toContain('\t.b\n\t\tmargin: 0');
	});
});

describe('at-rules', () => {
	test('media queries keep their own nested rules', () => {
		const sass = same_css('@media (min-width: 600px) { .a{color:red} .a:hover{color:blue} .b{margin:0} }');
		expect(sass).toBe('@media (min-width: 600px)\n\t.a\n\t\tcolor: red\n\t\t&:hover\n\t\t\tcolor: blue\n\t.b\n\t\tmargin: 0\n');
	});

	test('a media block for the selector just written folds into it', () => {
		const sass = same_css('.a{color:red}@media (max-width: 400px){.a{color:blue}}');
		expect(sass).toBe('.a\n\tcolor: red\n\t@media (max-width: 400px)\n\t\tcolor: blue\n');
	});

	test('a media block for other selectors stays top-level', () => {
		const sass = same_css('.a{color:red}@media print{.b{color:blue}}');
		expect(sass).toContain('\n@media print\n\t.b');
	});

	test('nestMedia: false keeps media top-level', () => {
		expect(css_to_sass('.a{color:red}@media print{.a{color:blue}}', { nestMedia: false }).sass).toContain('\n@media print\n\t.a');
	});

	test('supports, font-face, keyframes, import, charset, layer', () => {
		const sass = same_css(`@charset "UTF-8";
			@import url("a.css");
			@layer base, components;
			@font-face { font-family: "X"; src: url(x.woff2) format("woff2") }
			@keyframes spin { from { transform: rotate(0) } 50% { opacity: .5 } to { transform: rotate(360deg) } }
			@supports (display: grid) { .g { display: grid } }
			@layer base { .a { color: red } }`);
		expect(sass).toContain('@import url("a.css")');
		expect(sass).toContain('@keyframes spin\n\tfrom\n\t\ttransform: rotate(0)\n\t50%');
		expect(sass).toContain('@supports (display: grid)\n\t.g\n\t\tdisplay: grid');
	});

	test('a bare @import is flagged because Sass would resolve it', () => {
		expect(css_to_sass('@import "theme";').warnings[0]).toContain('Sass import');
	});
});

describe('comments', () => {
	const css = '/* Header */\n.a { /* inline */ color: red }\n/*! keep me */\n.b{color:blue}';

	test('silent by default', () => {
		const sass = css_to_sass(css).sass;
		expect(sass).toBe('// Header\n.a\n\t// inline\n\tcolor: red\n\n/*! keep me */\n.b\n\tcolor: blue\n');
		same_css(css);
	});

	test('loud and drop', () => {
		expect(css_to_sass(css, { comments: 'loud' }).sass).toContain('/* Header */');
		const dropped = css_to_sass(css, { comments: 'drop' }).sass;
		expect(dropped).not.toContain('Header');
		expect(dropped).toContain('/*! keep me */');
	});

	test('multi-line block comments', () => {
		const multi = '/*\n * Title\n * more\n */\n.a{color:red}';
		expect(css_to_sass(multi).sass).toBe('// Title\n// more\n.a\n\tcolor: red\n');
		const loud = css_to_sass(multi, { comments: 'loud' }).sass;
		compileString(loud, { syntax: 'indented' });
	});
});

describe('errors and edge cases', () => {
	test('unclosed block reports a position', () => {
		try {
			css_to_sass('.a {\n  color: red;\n');
			throw new Error('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(CssParseError);
			expect((e as CssParseError).line).toBe(1);
		}
	});

	test('stray } and unclosed strings/comments throw', () => {
		expect(() => css_to_sass('.a{color:red}}')).toThrow(CssParseError);
		expect(() => css_to_sass('.a{content:"x}')).toThrow(CssParseError);
		expect(() => css_to_sass('/* x')).toThrow(CssParseError);
	});

	test('a declaration without a colon throws', () => {
		expect(() => css_to_sass('.a{color red}')).toThrow(/property: value/);
	});

	test('interpolation-looking text is escaped', () => {
		const sass = css_to_sass('.a{content:"#{x}"}').sass;
		expect(sass).toContain('\\#{x}');
		expect(compileString(sass, { syntax: 'indented' }).css).toContain('#{x}');
	});

	test('IE hacks and top-level declarations are dropped with warnings', () => {
		const r = css_to_sass('color: red; .a{*zoom:1; color: red}');
		expect(r.warnings.length).toBe(2);
		expect(r.sass).toBe('.a\n\tcolor: red\n');
	});

	test('empty input', () => {
		expect(css_to_sass('').sass).toBe('');
		expect(css_to_sass('  /* only */ ', { comments: 'drop' }).sass).toBe('');
	});

	test('parse keeps positions', () => {
		const sheet = parse('\n\n  .a { color: red }');
		expect(sheet.children[0].start).toEqual({ line: 3, column: 3 });
	});

	test('a realistic stylesheet round-trips', () => {
		same_css(`
:root { --bg: #fff; --ink: #222 }
*, *::before, *::after { box-sizing: border-box }
html, body { margin: 0; font: 16px/1.5 system-ui, sans-serif }
.app { display: flex; min-height: 100vh }
.app .sidebar { width: 240px; border-right: 1px solid #eee }
.app .sidebar a { display: block; padding: 4px 8px }
.app .sidebar a:hover, .app .sidebar a:focus-visible { background: #f5f5f5 }
.app .sidebar a.active { font-weight: 600 }
.app main { flex: 1 1 0%; padding: 24px }
@media (max-width: 800px) { .app { flex-direction: column } .app .sidebar { width: auto } }
.btn { display: inline-flex; gap: 4px }
.btn:disabled { opacity: .5 }
.btn--primary { background: var(--accent, #06c); color: #fff }
table td:nth-child(2n + 1) { background: #fafafa }
`);
	});
});
