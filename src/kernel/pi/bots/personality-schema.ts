import type { Schema } from './schema.ts';

/** Validation schema for a bot's personality view (identity, character, capabilities, memory). Ported from pibots' personality.schema.json. */
export const PERSONALITY_SCHEMA = {
	"type": "object",
	"additionalProperties": false,
	"required": [
		"version",
		"created",
		"identity",
		"character",
		"capabilities",
		"memory"
	],
	"properties": {
		"version": {
			"const": 1
		},
		"created": {
			"type": "boolean",
			"description": "false until the identity was first written"
		},
		"identity": {
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"role",
				"mission",
				"createdAt"
			],
			"properties": {
				"name": {
					"type": "string",
					"minLength": 1,
					"maxLength": 40
				},
				"role": {
					"type": "string",
					"minLength": 1,
					"maxLength": 120
				},
				"mission": {
					"type": "string",
					"minLength": 1,
					"maxLength": 600
				},
				"createdAt": {
					"type": "integer",
					"minimum": 0
				}
			}
		},
		"character": {
			"type": "object",
			"additionalProperties": false,
			"required": [
				"tone",
				"verbosity",
				"traits",
				"addressUserAs",
				"notes"
			],
			"properties": {
				"tone": {
					"enum": [
						"neutral",
						"friendly",
						"formal",
						"playful",
						"direct"
					]
				},
				"verbosity": {
					"enum": [
						"terse",
						"normal",
						"detailed"
					]
				},
				"traits": {
					"type": "array",
					"maxItems": 8,
					"items": {
						"type": "string",
						"minLength": 1,
						"maxLength": 40
					}
				},
				"addressUserAs": {
					"type": "string",
					"maxLength": 40
				},
				"notes": {
					"type": "string",
					"maxLength": 1500,
					"description": "free-form style guidance"
				}
			}
		},
		"capabilities": {
			"type": "object",
			"additionalProperties": false,
			"required": [
				"shell",
				"fileWrite",
				"browser",
				"agentEditsCharacter"
			],
			"properties": {
				"shell": {
					"type": "boolean",
					"description": "offer/allow the bash tool"
				},
				"fileWrite": {
					"type": "boolean",
					"description": "offer/allow write and edit (read, list_dir and search_files are always on)"
				},
				"browser": {
					"type": "boolean",
					"description": "offer/allow the browser_* tools"
				},
				"agentEditsCharacter": {
					"type": "boolean",
					"description": "the agent may call character_edit"
				}
			}
		},
		"memory": {
			"type": "object",
			"additionalProperties": false,
			"required": [
				"viewBudgetChars",
				"keepRecent",
				"fan",
				"summaryModel",
				"profileCapBytes",
				"agentMayCommitProfile"
			],
			"properties": {
				"viewBudgetChars": {
					"type": "integer",
					"minimum": 2000,
					"maximum": 32000,
					"description": "constant size of the temporal memory view"
				},
				"keepRecent": {
					"type": "integer",
					"minimum": 4,
					"maximum": 64,
					"description": "newest lines never merged"
				},
				"fan": {
					"type": "integer",
					"minimum": 2,
					"maximum": 12,
					"description": "lines merged into one"
				},
				"summaryModel": {
					"type": "string",
					"maxLength": 200,
					"description": "provider/modelId for the background summarizer; empty = the active model"
				},
				"profileCapBytes": {
					"type": "integer",
					"minimum": 256,
					"maximum": 8000
				},
				"agentMayCommitProfile": {
					"type": "boolean",
					"description": "false: the agent's profile entries are proposals the user must accept"
				}
			}
		}
	}
} as unknown as Schema & { properties: Record<string, Schema> };
