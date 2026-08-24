<script>
	import { enhance } from '$app/forms';
	import { computeDeltas, teamWinChance } from '$lib/elo.js';

	let { data, form } = $props();

	/** @typedef {{ id: number, name: string, rating: number, games: number }} Player */

	/** @type {Record<number, 'A' | 'B'>} */
	let assigned = $state({});
	let note = $state('');
	let showNote = $state(false);
	let submitting = $state(false);

	const teamA = $derived(data.players.filter((p) => assigned[p.id] === 'A'));
	const teamB = $derived(data.players.filter((p) => assigned[p.id] === 'B'));
	const bench = $derived(data.players.filter((p) => !assigned[p.id]));
	const ready = $derived(teamA.length > 0 && teamB.length > 0);

	const chanceA = $derived(ready ? teamWinChance(teamA, teamB) : 0.5);

	// What each player stands to gain or lose — the whole point of the rating
	// system, so it's on screen before anyone commits to a result.
	const ifA = $derived(ready ? computeDeltas(teamA, teamB, 'A') : new Map());
	const ifB = $derived(ready ? computeDeltas(teamA, teamB, 'B') : new Map());

	/**
	 * Tap cycles a player through: bench → team A → team B → bench.
	 * @param {number} id
	 */
	function cycle(id) {
		/** @type {Record<number, 'A' | 'B'>} */
		const next = { ...assigned };
		if (next[id] === 'A') next[id] = 'B';
		else if (next[id] === 'B') delete next[id];
		else next[id] = 'A';
		assigned = next;
	}

	function clear() {
		assigned = {};
	}

	/** @param {Player[]} team */
	const avg = (team) =>
		team.length ? Math.round(team.reduce((n, p) => n + p.rating, 0) / team.length) : 0;

	/** Split the players already on the table into the fairest two teams. */
	function balance() {
		const pool = [...teamA, ...teamB];
		if (pool.length < 2) return;

		const half = Math.floor(pool.length / 2);

		/** @type {[Player[], Player[]][]} */
		const splits = [];

		if (pool.length <= 14) {
			// Small enough to enumerate every split and take the fairest one.
			/** @param {number} start @param {number[]} picked */
			const combos = (start, picked) => {
				if (picked.length === half) {
					const side = new Set(picked);
					splits.push([
						pool.filter((_, i) => side.has(i)),
						pool.filter((_, i) => !side.has(i))
					]);
					return;
				}
				for (let i = start; i < pool.length; i++) combos(i + 1, [...picked, i]);
			};
			combos(0, []);
		} else {
			// Snake draft by rating — close enough, and instant.
			const sorted = [...pool].sort((a, b) => b.rating - a.rating);
			const left = sorted.filter((_, i) => i % 4 === 0 || i % 4 === 3);
			splits.push([left, sorted.filter((p) => !left.includes(p))]);
		}

		/** @param {[Player[], Player[]]} split */
		const gap = ([left, right]) => Math.abs(avg(left) - avg(right));
		const [teamOne, teamTwo] = splits.reduce((a, b) => (gap(b) < gap(a) ? b : a));

		/** @type {Record<number, 'A' | 'B'>} */
		const next = {};
		for (const p of teamOne) next[p.id] = 'A';
		for (const p of teamTwo) next[p.id] = 'B';
		assigned = next;
	}

	function swapSides() {
		assigned = Object.fromEntries(
			Object.entries(assigned).map(([id, t]) => [id, t === 'A' ? 'B' : 'A'])
		);
	}

	/** @param {number} n */
	const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
</script>

<svelte:head><title>New match · Pottr</title></svelte:head>

<header class="page-head">
	<div>
		<h1>New match</h1>
		<p>Tap to add · tap again to switch teams</p>
	</div>
	{#if Object.keys(assigned).length}
		<button type="button" class="btn btn-ghost" onclick={clear}>Clear</button>
	{/if}
</header>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

{#if data.players.length < 2}
	<div class="card empty">
		<p>You need at least two players before you can record a match.</p>
		<a class="btn btn-primary" href="/players">Add players</a>
	</div>
{:else}
	<div class="teams">
		{#each [{ key: 'A', label: 'Team A', team: teamA }, { key: 'B', label: 'Team B', team: teamB }] as side (side.key)}
			<section class="team team-{side.key}" aria-label={side.label}>
				<header>
					<h2>{side.label}</h2>
					<span class="num muted">{side.team.length ? `avg ${avg(side.team)}` : '—'}</span>
				</header>

				{#if side.team.length}
					<ul>
						{#each side.team as p (p.id)}
							<li>
								<button
									type="button"
									class="member"
									title="Move to the other team"
									onclick={() => cycle(p.id)}
								>
									<span class="mname">{p.name}</span>
									<span class="num rating">{p.rating}</span>
									{#if ready}
										<span class="odds">
											<span class="delta up">{sign((side.key === 'A' ? ifA : ifB).get(p.id) ?? 0)}</span>
											<span class="delta down">{sign((side.key === 'A' ? ifB : ifA).get(p.id) ?? 0)}</span>
										</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="slot">Nobody yet</p>
				{/if}
			</section>
		{/each}
	</div>

	{#if ready}
		<div class="odds-bar" role="img" aria-label="Team A win chance {Math.round(chanceA * 100)} percent">
			<div class="fill" style="width: {chanceA * 100}%"></div>
			<span class="left num">{Math.round(chanceA * 100)}%</span>
			<span class="right num">{100 - Math.round(chanceA * 100)}%</span>
		</div>
	{/if}

	<div class="tools">
		<button type="button" class="btn btn-ghost" onclick={balance} disabled={teamA.length + teamB.length < 2}>
			Balance teams
		</button>
		<button type="button" class="btn btn-ghost" onclick={swapSides} disabled={!ready}>Swap sides</button>
	</div>

	{#if bench.length}
		<h2 class="section">Available</h2>
		<div class="bench">
			{#each bench as p (p.id)}
				<button type="button" class="chip" onclick={() => cycle(p.id)}>
					{p.name}<span class="num muted">{p.rating}</span>
				</button>
			{/each}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<input type="hidden" name="teamA" value={teamA.map((p) => p.id).join(',')} />
		<input type="hidden" name="teamB" value={teamB.map((p) => p.id).join(',')} />
		<input type="hidden" name="note" value={note} />

		{#if showNote}
			<input type="text" bind:value={note} placeholder="Note (optional) — e.g. best of 3" maxlength="120" />
		{:else if ready}
			<button type="button" class="btn btn-ghost add-note" onclick={() => (showNote = true)}>
				+ Add a note
			</button>
		{/if}

		<div class="finish">
			<button class="btn win-a" name="winner" value="A" disabled={!ready || submitting}>
				Team A won
			</button>
			<button class="btn win-b" name="winner" value="B" disabled={!ready || submitting}>
				Team B won
			</button>
		</div>
	</form>
{/if}

<style>
	.teams {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.team {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 8rem;
		padding: 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: 3px solid var(--side);
		border-radius: var(--r-lg);
	}

	.team-A {
		--side: var(--team-a);
		--on-side: var(--team-a-on);
	}

	.team-B {
		--side: var(--team-b);
		--on-side: var(--team-b-on);
	}

	.team header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.team h2 {
		font-size: 0.9rem;
		color: var(--side);
	}

	.team header span {
		font-size: 0.78rem;
	}

	.team ul {
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

	.mname {
		font-size: 0.9rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member .rating {
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
		background: color-mix(in oklab, var(--team-b) 40%, var(--surface));
		border-radius: 999px;
		overflow: hidden;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.odds-bar .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in oklab, var(--team-a) 45%, var(--surface));
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

	.section {
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

	.chip:hover {
		border-color: var(--accent);
	}

	.chip .muted {
		font-size: 0.78rem;
	}

	form {
		margin-top: 1.5rem;
	}

	.add-note {
		padding: 0.4rem 0;
		font-size: 0.85rem;
		border: 0;
		color: var(--muted);
	}

	.finish {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}

	.finish .btn {
		padding: 1rem 0.5rem;
		font-size: 1rem;
	}

	.win-a {
		background: var(--team-a);
		border-color: var(--team-a);
		color: var(--team-a-on);
	}

	.win-b {
		background: var(--team-b);
		border-color: var(--team-b);
		color: var(--team-b-on);
	}

	.finish .btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}
</style>
