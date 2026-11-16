<!--
	Puts players onto sides before a match, with a live preview of what each
	player stands to win or lose. Shared by every game module.

	- teams mode: tap cycles a player bench → side 1 → side 2 → … → bench.
	- solo mode: every player is their own side (a darts free-for-all).
-->
<script lang="ts">
	import { signed } from '$lib/core/format';
	import { computeDeltas, winChances, type RatingConfig } from '$lib/core/rating/elo';
	import type { RosterPlayer } from '$lib/modules/types';
	import { balanceTeams } from './balance';

	interface Props {
		players: readonly RosterPlayer[];
		/** Player ids on each side. Bindable. */
		sides: number[][];
		rating: RatingConfig;
		mode?: 'teams' | 'solo';
		/** In teams mode, how many sides to show. */
		sideCount?: number;
		maxPerSide?: number;
		/** In solo mode, the most players allowed. */
		maxSides?: number;
		labels?: readonly string[];
	}

	let {
		players,
		sides = $bindable(),
		rating,
		mode = 'teams',
		sideCount = 2,
		maxPerSide = 8,
		maxSides = 8,
		labels
	}: Props = $props();

	const byId = $derived(new Map(players.map((p) => [p.id, p])));
	const padded = $derived(
		mode === 'teams' ? Array.from({ length: sideCount }, (_, i) => sides[i] ?? []) : sides
	);
	const resolved = $derived(
		padded.map((side) => side.map((id) => byId.get(id)).filter((p): p is RosterPlayer => !!p))
	);
	const taken = $derived(new Set(sides.flat()));
	const bench = $derived(players.filter((p) => !taken.has(p.id)));
	const ready = $derived(resolved.length >= 2 && resolved.every((side) => side.length > 0));
	const chances = $derived(ready ? winChances(resolved) : []);

	/** What each player gains if their side wins and loses if it comes last. */
	const preview = $derived.by(() => {
		const out = new Map<number, { win: number; lose: number }>();
		if (!ready) return out;
		resolved.forEach((side, i) => {
			const winPlacings = resolved.map((_, j) => (j === i ? 1 : 2));
			const losePlacings = resolved.map((_, j) => (j === i ? resolved.length : 1));
			const ifWin = computeDeltas(resolved, winPlacings, rating);
			const ifLose = computeDeltas(resolved, losePlacings, rating);
			for (const p of side) out.set(p.id, { win: ifWin.get(p.id) ?? 0, lose: ifLose.get(p.id) ?? 0 });
		});
		return out;
	});

	const labelFor = (i: number): string =>
		labels?.[i] ?? (mode === 'solo' ? (resolved[i]?.[0]?.name ?? `Player ${i + 1}`) : `Team ${String.fromCharCode(65 + i)}`);

	const average = (side: readonly RosterPlayer[]): number =>
		side.length ? Math.round(side.reduce((n, p) => n + p.rating, 0) / side.length) : 0;

	function tap(id: number) {
		if (mode === 'solo') {
			if (taken.has(id)) sides = sides.filter((side) => !side.includes(id));
			else if (sides.length < maxSides) sides = [...sides, [id]];
			return;
		}
		const next = Array.from({ length: sideCount }, (_, i) => [...(sides[i] ?? [])]);
		const current = next.findIndex((side) => side.includes(id));
		if (current >= 0) next[current] = next[current]!.filter((x) => x !== id);
		// Move to the next side with room, or back to the bench.
		for (let i = current + 1; i < sideCount; i++) {
			if (next[i]!.length < maxPerSide) {
				next[i]!.push(id);
				break;
			}
		}
		sides = next;
	}

	function balance() {
		const [a, b] = balanceTeams(resolved.flat());
		sides = [a.map((p) => p.id), b.map((p) => p.id)];
	}

	function swap() {
		sides = [...sides].reverse();
	}

	function clear() {
		sides = mode === 'solo' ? [] : Array.from({ length: sideCount }, () => []);
	}
</script>

<div class="picker">
	<div class="sides" class:solo={mode === 'solo'}>
		{#each resolved as side, i (i)}
			<section class="side" style:--side="var(--side-{i % 8})" aria-label={labelFor(i)}>
				<header>
					<h3>{labelFor(i)}</h3>
					<span class="num muted">
						{#if ready && chances[i] !== undefined}{Math.round(chances[i] * 100)}%{:else if side.length && mode === 'teams'}avg {average(side)}{/if}
					</span>
				</header>
				{#if side.length}
					<ul>
						{#each side as p (p.id)}
							<li>
								<button type="button" class="member" onclick={() => tap(p.id)} title={mode === 'solo' ? 'Remove' : 'Move to the next side'}>
									<span class="name">{p.name}</span>
									<span class="num rating">{p.rating}</span>
									{#if preview.has(p.id)}
										<span class="odds num">
											<span class="delta up">{signed(preview.get(p.id)!.win)}</span>
											<span class="delta down">{signed(preview.get(p.id)!.lose)}</span>
										</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="slot">Tap a player below</p>
				{/if}
			</section>
		{/each}
		{#if mode === 'solo' && resolved.length < 2}
			{#each Array.from({ length: 2 - resolved.length }) as _, k (k)}
				<section class="side placeholder" style:--side="var(--side-{(resolved.length + k) % 8})">
					<p class="slot">Player {resolved.length + k + 1}</p>
				</section>
			{/each}
		{/if}
	</div>

	{#if ready && resolved.length === 2}
		<div class="odds-bar" role="img" aria-label="{labelFor(0)} win chance {Math.round((chances[0] ?? 0.5) * 100)} percent">
			<div class="fill" style:width="{(chances[0] ?? 0.5) * 100}%"></div>
			<span class="num">{Math.round((chances[0] ?? 0.5) * 100)}%</span>
			<span class="num right">{100 - Math.round((chances[0] ?? 0.5) * 100)}%</span>
		</div>
	{/if}

	<div class="tools">
		{#if mode === 'teams' && sideCount === 2}
			<button type="button" class="btn btn-ghost" onclick={balance} disabled={taken.size < 2}>Balance teams</button>
			<button type="button" class="btn btn-ghost" onclick={swap} disabled={!ready}>Swap sides</button>
		{/if}
		<button type="button" class="btn btn-ghost" onclick={clear} disabled={taken.size === 0}>Clear</button>
	</div>

	{#if bench.length}
		<h3 class="section-label">Available</h3>
		<div class="bench">
			{#each bench as p (p.id)}
				<button type="button" class="chip" onclick={() => tap(p.id)} disabled={mode === 'solo' && sides.length >= maxSides}>
					{p.name}<span class="num muted">{p.rating}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 7rem;
		padding: 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: 3px solid var(--side);
		border-radius: var(--r-lg);
	}

	.solo .side {
		min-height: 0;
	}

	.side.placeholder {
		border-style: dashed;
		border-top-style: solid;
	}

	.side header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h3 {
		margin: 0;
		font-size: 0.9rem;
	}

	.side h3 {
		color: var(--side);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.side header span {
		font-size: 0.78rem;
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.member {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.15rem 0.5rem;
		width: 100%;
		padding: 0.45rem 0.6rem;
		background: color-mix(in oklab, var(--side) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--side) 30%, transparent);
		border-radius: var(--r-sm);
		text-align: left;
		cursor: pointer;
	}

	.member:hover {
		background: color-mix(in oklab, var(--side) 20%, transparent);
	}

	.name {
		font-size: 0.9rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rating {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.odds {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.45rem;
		font-size: 0.72rem;
	}

	.slot {
		margin: auto 0;
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
	}

	.odds-bar {
		position: relative;
		display: flex;
		align-items: center;
		height: 1.6rem;
		margin-top: 0.6rem;
		background: color-mix(in oklab, var(--side-1) 40%, var(--surface));
		border-radius: 999px;
		overflow: hidden;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.odds-bar .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in oklab, var(--side-0) 45%, var(--surface));
		transition: width 0.25s ease;
	}

	.odds-bar span {
		position: relative;
		padding: 0 0.65rem;
	}

	.odds-bar .right {
		margin-left: auto;
	}

	.tools {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}

	.tools .btn {
		flex: 1;
		padding: 0.55rem;
		font-size: 0.85rem;
	}

	.section-label {
		margin: 1.5rem 0 0.6rem;
		color: var(--muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.bench {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.chip:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chip .muted {
		font-size: 0.78rem;
	}
</style>
