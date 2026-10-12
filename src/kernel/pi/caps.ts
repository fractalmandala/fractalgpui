// Size guards for anything that reaches the durable log. Image bytes and unbounded output never get stored.
import type { ToolExecutionResult } from "@earendil-works/pi-durable";

export const MAX_RESULT_CHARS = 32_000;
export const MAX_DETAILS_BYTES = 8_000;
export const MAX_ARG_PREVIEW = 400;

/** Truncate on a code-point boundary, preferring a line boundary; notes how much was cut. Output <= max + note. */
export function capText(text: string, max = MAX_RESULT_CHARS): { text: string; truncated: boolean; omitted: number } {
	if (text.length <= max) return { text, truncated: false, omitted: 0 };
	let cut = max;
	// don't split a surrogate pair
	const c = text.charCodeAt(cut - 1);
	if (c >= 0xd800 && c <= 0xdbff) cut--;
	const nl = text.lastIndexOf("\n", cut);
	if (nl > max * 0.8) cut = nl;
	const omitted = text.length - cut;
	return {
		text: `${text.slice(0, cut)}\n[truncated: ${omitted} more characters omitted (limit ${max}); ask for a narrower range or use offset/limit]`,
		truncated: true,
		omitted,
	};
}

/** Heuristic: a long unbroken base64-ish run (the pidots failure mode). */
const BASE64_RUN = /[A-Za-z0-9+/=]{2000,}/g;
export function stripBase64Runs(text: string): { text: string; stripped: number } {
	let stripped = 0;
	const out = text.replace(BASE64_RUN, (m) => {
		stripped += m.length;
		return `[binary-like data of ${m.length} chars omitted]`;
	});
	return { text: out, stripped };
}

export interface CapReport {
	truncated: boolean;
	imagesDropped: number;
	detailsDropped: boolean;
}

/** Cap a tool result before it is committed: text blocks capped, image blocks replaced by a note, details bounded. */
export function capToolResult(result: ToolExecutionResult): { result: ToolExecutionResult; report: CapReport } {
	const report: CapReport = { truncated: false, imagesDropped: 0, detailsDropped: false };
	let content = result.content;
	if (content) {
		const out: typeof content = [];
		let budget = MAX_RESULT_CHARS;
		for (const part of content) {
			if (part.type === "text") {
				const clean = stripBase64Runs(part.text).text;
				const capped = capText(clean, Math.max(budget, 0));
				if (capped.truncated) report.truncated = true;
				budget -= Math.min(capped.text.length, budget);
				out.push({ ...part, text: capped.text });
			} else {
				report.imagesDropped++;
				out.push({
					type: "text",
					text: "[image omitted: fractalgpui never stores image bytes in the conversation; screenshots are saved as files]",
				});
			}
		}
		content = out;
	}
	let details = result.details;
	if (details !== undefined && JSON.stringify(details).length > MAX_DETAILS_BYTES) {
		details = { note: "details omitted (too large)" };
		report.detailsDropped = true;
	}
	return { result: { ...result, ...(content ? { content } : {}), ...(details !== undefined ? { details } : {}) }, report };
}

export function preview(value: unknown, max = MAX_ARG_PREVIEW): string {
	const s = typeof value === "string" ? value : JSON.stringify(value) ?? "";
	return s.length <= max ? s : `${s.slice(0, max)}…(+${s.length - max})`;
}
