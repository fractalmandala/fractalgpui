/** The small CSS syntax tree the converter works on. Positions are 1-based. */

export interface Position {
	line: number;
	column: number;
}

export interface Comment {
	type: 'comment';
	/** The text between `/*` and `*\/`, untrimmed. */
	text: string;
	start: Position;
}

export interface Declaration {
	type: 'decl';
	prop: string;
	/** Whitespace-collapsed value, without `!important`. */
	value: string;
	important: boolean;
	start: Position;
}

export interface Rule {
	type: 'rule';
	/** Whitespace-collapsed selector list, as written. */
	selector: string;
	children: Node[];
	start: Position;
}

export interface AtRule {
	type: 'atrule';
	/** Without the `@`, lowercased. */
	name: string;
	params: string;
	/** `null` for a statement such as `@import url(a.css);`. */
	children: Node[] | null;
	start: Position;
}

export type Node = Comment | Declaration | Rule | AtRule;

export interface Stylesheet {
	type: 'stylesheet';
	children: Node[];
}
