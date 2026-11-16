import { error, fail, type ActionFailure } from '@sveltejs/kit';
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';

/** Reads a form into a typed object, or throws a UserError naming the first problem. */
export async function readForm<S extends v.GenericSchema>(
	request: Request,
	schema: S
): Promise<v.InferOutput<S>> {
	const form = Object.fromEntries(await request.formData());
	const result = v.safeParse(schema, form);
	if (!result.success) throw new UserError(result.issues[0].message);
	return result.output;
}

/**
 * Runs an action body; a UserError becomes a 400 with its message for the
 * form to show, anything else is a real failure and propagates.
 */
export async function attempt<T>(
	fn: () => Promise<T>
): Promise<T | ActionFailure<{ error: string }>> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof UserError) return fail(400, { error: err.message });
		throw err;
	}
}

/** Form fields arrive as strings; these coerce them. */
export const formId = v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1));
export const formText = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
export const formFlag = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) => s === '1' || s === 'on' || s === 'true')
);

export function requireAdmin(locals: App.Locals): void {
	if (!locals.admin) error(403, 'Only an admin can do that');
}

export function requireMember(locals: App.Locals): void {
	if (!locals.member) error(403, 'Enter the office passphrase first');
}
