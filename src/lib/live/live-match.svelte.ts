import { browser } from '$app/environment';

/**
 * A match being played live on one device, kept as a setup plus a list of
 * events (points, throws…). The game's state is always derived by replaying
 * the events, which makes undo trivial and means the server can replay the
 * exact same list to check the result.
 *
 * Everything is saved to localStorage after each change, so a locked phone,
 * a reload or a dropped connection never loses a game.
 */
export class LiveMatch<Setup, Event> {
	setup = $state<Setup | null>(null);
	events = $state<Event[]>([]);

	readonly #key: string;

	/** @param key unique per game, e.g. `pingpong`; bump `version` when the saved shape changes. */
	constructor(key: string, version = 1) {
		this.#key = `work-league:live:${key}:v${version}`;
		this.#restore();
	}

	get started(): boolean {
		return this.setup !== null;
	}

	start(setup: Setup): void {
		this.setup = setup;
		this.events = [];
		this.#save();
	}

	push(event: Event): void {
		this.events = [...this.events, event];
		this.#save();
	}

	undo(): void {
		if (!this.events.length) return;
		this.events = this.events.slice(0, -1);
		this.#save();
	}

	/** Abandons the game, or clears it once it has been saved to the server. */
	clear(): void {
		this.setup = null;
		this.events = [];
		if (!browser) return;
		try {
			localStorage.removeItem(this.#key);
		} catch {
			// Storage can be unavailable (private mode); the game just won't survive a reload.
		}
	}

	#save(): void {
		if (!browser) return;
		try {
			localStorage.setItem(this.#key, JSON.stringify({ setup: this.setup, events: this.events }));
		} catch {
			// See clear().
		}
	}

	#restore(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(this.#key);
			if (!raw) return;
			const saved = JSON.parse(raw) as { setup: Setup | null; events: Event[] };
			this.setup = saved.setup;
			this.events = Array.isArray(saved.events) ? saved.events : [];
		} catch {
			this.clear();
		}
	}
}

/**
 * Keeps the screen on while a scorer is open (Screen Wake Lock API), so the
 * phone on the table doesn't go dark between points. Use as `{@attach keepAwake}`.
 */
export function keepAwake(_node: Element): () => void {
	let lock: WakeLockSentinel | null = null;
	let released = false;

	const request = async () => {
		if (released || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
		try {
			lock = await navigator.wakeLock.request('screen');
		} catch {
			// Denied (battery saver, unsupported); the game still works.
		}
	};
	// The OS drops the lock when the tab is hidden; take it again on return.
	const onVisibility = () => void request();

	void request();
	document.addEventListener('visibilitychange', onVisibility);
	return () => {
		released = true;
		document.removeEventListener('visibilitychange', onVisibility);
		void lock?.release();
	};
}
