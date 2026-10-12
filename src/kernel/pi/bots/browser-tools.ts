import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ToolExecutionApi, type ToolRegistration } from '@earendil-works/pi-durable';
import { botIdOf } from './extension.ts';
import { browserFor } from './browsers.ts';
import { capText } from '../caps.ts';

/**
 * Browser tools for a bot. Every result is TEXT: a screenshot is a file in the bot's media folder and the
 * result carries only its path. Gating (the bot's browser capability, access modes, approvals, audit, caps)
 * is applied by `guardTool` in tools.ts around each of these.
 */
const out = (t: string, isError = false) => ({ isError, content: [{ type: 'text' as const, text: capText(t).text }] });

async function withBrowser(api: ToolExecutionApi, context: Parameters<typeof botIdOf>[1], fn: (b: ReturnType<typeof browserFor>) => Promise<string>) {
	const botId = await botIdOf(api, context);
	if (!botId) return out('This session has no bot, so it has no browser.', true);
	try {
		return out(await fn(browserFor(botId)));
	} catch (err) {
		return out((err as Error).message, true);
	}
}

const navigate = defineTool({
	name: 'browser_navigate',
	description: 'Open a web page (http or https) in your browser. Returns the final URL and title.',
	parameters: Type.Object({ url: Type.String() }),
	execute: (a, api: ToolExecutionApi, ctx) =>
		withBrowser(api, ctx, async (b) => {
			const r = await b.navigate((a as { url: string }).url);
			return `Opened ${r.url}\nTitle: ${r.title || '(none)'}`;
		})
});

const snapshot = defineTool({
	name: 'browser_snapshot',
	description: 'Text outline (accessibility tree) of the current page, or of one element via a CSS selector. Use it to find what to click or type into.',
	replay: 'safe',
	parameters: Type.Object({ selector: Type.Optional(Type.String()) }),
	execute: (a, api: ToolExecutionApi, ctx) => withBrowser(api, ctx, (b) => b.snapshot((a as { selector?: string }).selector || 'body'))
});

const screenshot = defineTool({
	name: 'browser_screenshot',
	description: 'Take a screenshot of the current page. It is saved as a file in your media folder; you get the file path, not the image.',
	parameters: Type.Object({}),
	execute: (_a, api: ToolExecutionApi, ctx) =>
		withBrowser(api, ctx, async (b) => {
			const s = await b.screenshot();
			return `Screenshot saved: ${s.path} (${s.bytes} bytes). The user can see it in the Browser view.`;
		})
});

const click = defineTool({
	name: 'browser_click',
	description: 'Click an element, by CSS selector or by visible text.',
	parameters: Type.Object({ selector: Type.Optional(Type.String()), text: Type.Optional(Type.String()) }),
	execute: (a, api: ToolExecutionApi, ctx) =>
		withBrowser(api, ctx, async (b) => {
			const t = a as { selector?: string; text?: string };
			await b.click(t);
			return `Clicked ${t.selector ?? `"${t.text}"`}. Now at ${b.state.url}`;
		})
});

const type = defineTool({
	name: 'browser_type',
	description: 'Type text into an input (replaces its content); submit=true presses Enter afterwards.',
	parameters: Type.Object({ selector: Type.String(), text: Type.String(), submit: Type.Optional(Type.Boolean()) }),
	execute: (a, api: ToolExecutionApi, ctx) =>
		withBrowser(api, ctx, async (b) => {
			const t = a as { selector: string; text: string; submit?: boolean };
			await b.type(t.selector, t.text, !!t.submit);
			return `Typed ${t.text.length} characters into ${t.selector}${t.submit ? ' and pressed Enter' : ''}.`;
		})
});

const extract = defineTool({
	name: 'browser_extract',
	description: 'Visible text of the page, or of one element via a CSS selector.',
	replay: 'safe',
	parameters: Type.Object({ selector: Type.Optional(Type.String()) }),
	execute: (a, api: ToolExecutionApi, ctx) => withBrowser(api, ctx, (b) => b.extractText((a as { selector?: string }).selector || 'body'))
});

/** Tool + the access class the policy treats it as (reads never ask; navigation and input are changes). */
export const BROWSER_TOOLS: { tool: ToolRegistration; toolClass: 'read' | 'write' }[] = [
	{ tool: navigate as unknown as ToolRegistration, toolClass: 'write' },
	{ tool: snapshot as unknown as ToolRegistration, toolClass: 'read' },
	{ tool: screenshot as unknown as ToolRegistration, toolClass: 'read' },
	{ tool: click as unknown as ToolRegistration, toolClass: 'write' },
	{ tool: type as unknown as ToolRegistration, toolClass: 'write' },
	{ tool: extract as unknown as ToolRegistration, toolClass: 'read' }
];
