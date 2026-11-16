import { poolModule } from './pool';
import type { LeagueModule } from './types';

/** The only place the Work League shell needs to know about installed modules. */
export const leagueModules: readonly LeagueModule[] = [poolModule];

export function moduleForPath(pathname: string): LeagueModule | undefined {
	return leagueModules.find(
		(module) =>
			pathname === module.href ||
			pathname.startsWith(`${module.href}/`) ||
			module.routePrefixes?.some(
				(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
			)
	);
}
