import { page } from '$app/state';
import type { LayoutData } from '../routes/$types';

/**
 * The root layout's data (branding, games, who is signed in), typed. Every
 * page has it, but `page.data` alone does not know its shape.
 */
export const shell = (): LayoutData => page.data as LayoutData;
