import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';
import { attempt, readForm, requireMember } from '$lib/server/forms';
import { enabledGame } from '$lib/server/games';
import { leaderboard, recordMatch } from '$lib/server/repositories/matches';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const game = enabledGame(locals, params.game);
	const players = (await leaderboard(game))
		.filter((p) => p.active)
		.map(({ id, name, rating, games }) => ({ id, name, rating, games }))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	return { players };
};

/** The record screen posts the whole match as JSON in one field. */
const Submission = v.object({
	sides: v.array(v.array(v.pipe(v.number(), v.integer()))),
	details: v.unknown(),
	note: v.optional(v.string())
});

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		requireMember(locals);
		const game = enabledGame(locals, params.game);
		const result = await attempt(async () => {
			const { match } = await readForm(request, v.object({ match: v.string() }));
			let json: unknown;
			try {
				json = JSON.parse(match);
			} catch {
				throw new UserError('That result could not be read');
			}
			const parsed = v.safeParse(Submission, json);
			if (!parsed.success) throw new UserError('That result could not be read');
			return recordMatch(game, parsed.output);
		});
		if (typeof result !== 'number') return result;
		redirect(303, `/${game.id}?recorded=${result}`);
	}
};
