import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { branding, access } = locals.settings;
	return {
		branding: {
			name: branding.name,
			tagline: branding.tagline,
			seed: branding.seed,
			logoVersion: branding.logoVersion
		},
		gameIds: locals.games.map((g) => g.id),
		member: locals.member,
		admin: locals.admin,
		/** A visitor on a public league: can look, cannot change anything. */
		readOnly: !locals.member,
		passphraseSet: access.passphraseHash !== null
	};
};
