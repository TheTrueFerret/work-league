import type { ParamMatcher } from '@sveltejs/kit';
import { isInstalledModule } from '$lib/modules/registry';

/** `/pool`, `/darts`, … match only installed game modules. */
export const match: ParamMatcher = (param) => isInstalledModule(param);
