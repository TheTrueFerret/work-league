import darts from './darts';
import pingpong from './pingpong';
import pool from './pool';
import type { GameModule } from './types';

/**
 * Every game module built into this copy of Work League. Adding a game is one
 * import and one entry here; admins can still switch each one off at runtime.
 */
export const installedModules: readonly GameModule[] = [
	pool as GameModule,
	pingpong as GameModule,
	darts as GameModule
];

const byId = new Map(installedModules.map((m) => [m.id, m]));

export const findModule = (id: string): GameModule | undefined => byId.get(id);

export const isInstalledModule = (id: string): boolean => byId.has(id);
