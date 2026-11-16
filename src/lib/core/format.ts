/** "+12" / "-7" / "0" for rating changes. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

export const plural = (n: number, one: string, many = `${one}s`): string =>
	`${n} ${n === 1 ? one : many}`;

/** "just now", "5m ago", "3d ago", then a short date. */
export function relativeTime(at: Date | string, now = Date.now()): string {
	const date = new Date(at);
	const minutes = Math.round((now - date.getTime()) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
	if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)}d ago`;
	return shortDate(date);
}

export const shortDate = (at: Date | string): string =>
	new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export const percent = (part: number, whole: number): string =>
	whole ? `${Math.round((part / whole) * 100)}%` : '–';
