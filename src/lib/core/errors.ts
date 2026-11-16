/**
 * A problem the person using the app caused and can fix, such as a duplicate
 * name or an impossible score. Its message is safe to show them; anything
 * else that goes wrong is logged and replaced with a generic message.
 */
export class UserError extends Error {
	override readonly name = 'UserError';
}

export const userMessage = (error: unknown): string | null =>
	error instanceof UserError ? error.message : null;
