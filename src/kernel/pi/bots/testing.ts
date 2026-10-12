import { BOT_SCHEMA_VERSION, DEFAULT_CAPABILITIES, DEFAULT_CHARACTER, DEFAULT_MEMORY, DEFAULT_MISSION, DEFAULT_ROLE, type BotMeta, type NewBotInput } from './meta.ts';

/** A valid in-memory bot for pure tests (no harness, no folders). */
export function createBotForTest(over: Partial<NewBotInput> = {}): BotMeta {
	return {
		schema: BOT_SCHEMA_VERSION,
		identity: { name: over.name ?? 'Pibot', role: over.role ?? DEFAULT_ROLE, mission: over.mission ?? DEFAULT_MISSION, createdAt: 1 },
		character: { ...DEFAULT_CHARACTER(), ...over.character },
		capabilities: { ...DEFAULT_CAPABILITIES(), ...over.capabilities },
		memory: { ...DEFAULT_MEMORY(), ...over.memory },
		profile: { entries: [], proposals: [], nextId: 1 },
		roles: over.roles ?? [],
		workspace: over.workspace ?? '/tmp/botroom',
		workspaceIsBotroom: true,
		createdAt: 1,
		updatedAt: 1,
		archived: false
	};
}
