<!--
	Ping pong: pick the players, then either score the match rally by rally
	on a phone lying by the net, or type in the game scores afterwards.
-->
<script lang="ts">
	import * as v from 'valibot';
	import Icon from '$lib/components/Icon.svelte';
	import SidePicker from '$lib/components/SidePicker.svelte';
	import { userMessage } from '$lib/core/errors';
	import { keepAwake, LiveMatch } from '$lib/live/live-match.svelte';
	import type { RecordProps } from '../types';
	import {
		replay,
		validateGames,
		winsNeeded,
		type BestOf,
		type MatchState,
		type PingPongDetails,
		type PingPongSetup,
		type PointsToWin,
		type Side
	} from './rules';
	import { setupSchema } from './schema';

	let { players, rating, submit, submitting, error }: RecordProps = $props();

	interface LiveSetup {
		sides: number[][];
		rules: PingPongSetup;
	}

	const savedShape = v.object({
		sides: v.tuple([v.array(v.number()), v.array(v.number())]),
		rules: setupSchema
	});

	const live = new LiveMatch<LiveSetup, Side>('pingpong');
	// Storage outlives app versions; drop a saved game this version can't read.
	if (
		live.setup &&
		(!v.is(savedShape, live.setup) || !v.is(v.array(v.picklist([0, 1])), live.events))
	) {
		live.clear();
	}

	// --- Setup ---------------------------------------------------------------

	let sides = $state<number[][]>([[], []]);
	let pointsToWin = $state<PointsToWin>(11);
	let bestOf = $state<BestOf>(3);
	let firstServer = $state<Side>(0);
	let step = $state<'setup' | 'scores'>('setup');
	let note = $state('');
	let showNote = $state(false);

	const byId = $derived(new Map(players.map((p) => [p.id, p])));
	const ready = $derived(sides.length === 2 && sides.every((side) => side.length > 0));

	const sideName = (ids: readonly number[] | undefined, i: number): string =>
		ids?.length
			? ids.map((id) => byId.get(id)?.name ?? 'Unknown').join(' & ')
			: `Team ${i === 0 ? 'A' : 'B'}`;

	function start() {
		live.start({ sides: $state.snapshot(sides), rules: { pointsToWin, bestOf, firstServer } });
		note = '';
		showNote = false;
	}

	function pickBestOf(n: BestOf) {
		bestOf = n;
		if (rows.length > n) rows = rows.slice(0, n);
	}

	// --- Quick entry ----------------------------------------------------------

	let rows = $state<(number | null)[][]>([
		[null, null],
		[null, null]
	]);

	const quick = $derived.by((): { winner: Side | null; message: string | null } => {
		const complete = rows.every(([a, b]) => typeof a === 'number' && typeof b === 'number');
		if (!complete) return { winner: null, message: null };
		try {
			const games = rows.map(([a, b]) => [a ?? 0, b ?? 0] as [number, number]);
			return { winner: validateGames({ pointsToWin, bestOf }, games), message: null };
		} catch (e) {
			return { winner: null, message: userMessage(e) ?? 'Those scores are not possible' };
		}
	});

	async function saveScores() {
		const details: PingPongDetails = {
			mode: 'scores',
			setup: { pointsToWin, bestOf },
			games: rows.map(([a, b]) => [a ?? 0, b ?? 0])
		};
		await submit({ sides: $state.snapshot(sides), details, note });
	}

	// --- Live scorer ----------------------------------------------------------

	const matchSides = $derived(live.setup?.sides ?? sides);
	const doubles = $derived(
		matchSides.length === 2 && matchSides.every((side) => side.length === 2)
	);
	const names = $derived([sideName(matchSides[0], 0), sideName(matchSides[1], 1)] as const);

	const match = $derived.by((): MatchState | null => {
		if (!live.setup) return null;
		try {
			return replay(live.setup.rules, live.events, doubles);
		} catch {
			return null;
		}
	});

	/** The player tapping "swap" to match how the phone lies on the table. */
	let turned = $state(false);
	// Players swap ends during a match; mirror that so each half stays theirs.
	const flipped = $derived(((match?.ends ?? 0) % 2 === 1) !== turned);
	const order = $derived<readonly Side[]>(flipped ? [1, 0] : [0, 1]);

	let confirmAbandon = $state(false);

	const serverName = $derived.by(() => {
		if (!match) return '';
		const { side, slot } = match.server;
		const id = slot === null ? undefined : matchSides[side]?.[slot];
		return id === undefined ? names[side] : (byId.get(id)?.name ?? names[side]);
	});

	const banner = $derived.by((): { text: string; tone: 'match' | 'game' | 'deuce' } | null => {
		if (!match || match.finished) return null;
		if (match.matchPoint !== null)
			return { text: `Match point · ${names[match.matchPoint]}`, tone: 'match' };
		if (match.gamePoint !== null)
			return { text: `Game point · ${names[match.gamePoint]}`, tone: 'game' };
		if (match.deuce) return { text: 'Deuce', tone: 'deuce' };
		return null;
	});

	const lastGame = $derived(match?.games.at(-1));
	const winnerName = $derived(match?.winner == null ? '' : names[match.winner]);
	const winnerIsPair = $derived(
		match?.winner != null && (matchSides[match.winner]?.length ?? 0) > 1
	);

	function point(side: Side) {
		if (!match || match.finished) return;
		confirmAbandon = false;
		live.push(side);
		navigator.vibrate?.(15);
	}

	function abandon() {
		live.clear();
		confirmAbandon = false;
		turned = false;
	}

	async function saveLive() {
		if (!live.setup) return;
		const details: PingPongDetails = {
			mode: 'live',
			setup: $state.snapshot(live.setup.rules),
			points: $state.snapshot(live.events)
		};
		if (await submit({ sides: $state.snapshot(live.setup.sides), details, note })) live.clear();
	}

	/** Arrow keys score for the left and right halves on a laptop; Backspace undoes. */
	function onkeydown(event: KeyboardEvent) {
		if (!match || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey)
			return;
		if (event.key === 'ArrowLeft') point(order[0]!);
		else if (event.key === 'ArrowRight') point(order[1]!);
		else if (event.key === 'Backspace') live.undo();
		else return;
		event.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

{#snippet segment(label: string, active: boolean, pick: () => void)}
	<button type="button" class="seg" aria-pressed={active} onclick={pick}>{label}</button>
{/snippet}

{#snippet noteField()}
	{#if showNote}
		<input type="text" bind:value={note} placeholder="Note (optional)" maxlength="120" />
	{:else}
		<button type="button" class="btn btn-ghost add-note" onclick={() => (showNote = true)}
			>+ Add a note</button
		>
	{/if}
{/snippet}

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if live.started}
	{#if !match}
		<div class="card empty">
			<p>This saved game could not be read.</p>
			<button type="button" class="btn btn-danger" onclick={abandon}>Discard it</button>
		</div>
	{:else if match.finished}
		<section class="card summary" aria-labelledby="result">
			<p class="section-label eyebrow">Final</p>
			<h2 id="result">
				{winnerName}
				{winnerIsPair ? 'win' : 'wins'}
				{match.gamesWon[match.winner ?? 0]}–{match.gamesWon[match.winner === 0 ? 1 : 0]}
			</h2>

			<table class="board num">
				<thead>
					<tr>
						<th scope="col"><span class="sr-only">Side</span></th>
						{#each match.games as _, g (g)}<th scope="col">G{g + 1}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each [0, 1] as const as s (s)}
						<tr class:won={match.winner === s} style:--side="var(--side-{s})">
							<th scope="row">{names[s]}</th>
							{#each match.games as g, i (i)}
								<td class:took={g[s] > g[s === 0 ? 1 : 0]}>{g[s]}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="save-area">
				{@render noteField()}
				<button type="button" class="btn btn-primary big" disabled={submitting} onclick={saveLive}>
					{submitting ? 'Saving…' : 'Save result'}
				</button>
				<div class="row">
					<button
						type="button"
						class="btn btn-ghost"
						disabled={submitting}
						onclick={() => live.undo()}
					>
						<Icon name="undo" size="1.1rem" /> Undo point
					</button>
					{@render abandonButton()}
				</div>
			</div>
		</section>
	{:else}
		<div class="scorer" {@attach keepAwake}>
			<div class="status">
				<span class="muted">
					Game {match.gameIndex + 1}{#if live.setup && live.setup.rules.bestOf > 1}&nbsp;of {live
							.setup.rules
							.bestOf}{/if}{#if match.deciding && live.setup && live.setup.rules.bestOf > 1}&nbsp;·
						decider{/if}
				</span>
				{#if banner}
					<span class="banner {banner.tone}" role="status">{banner.text}</span>
				{/if}
			</div>

			{#if match.changeEnds}
				<div class="notice ends" role="status">
					<span>
						{#if lastGame && match.score[0] === 0 && match.score[1] === 0}
							Game {match.games.length} to {names[lastGame[0] > lastGame[1] ? 0 : 1]}, {Math.max(
								...lastGame
							)}–{Math.min(...lastGame)}.
						{/if}
						<strong>Change ends.</strong>
					</span>
				</div>
			{/if}

			<div class="courts">
				{#each order as s (s)}
					<button
						type="button"
						class="court"
						style:--side="var(--side-{s})"
						style:--on-side="var(--on-side-{s})"
						aria-label="Point to {names[s]}, {match.score[s]} now"
						onclick={() => point(s)}
					>
						<span class="who">{names[s]}</span>
						<span class="score num">{match.score[s]}</span>
						{#if live.setup && live.setup.rules.bestOf > 1}
							<span class="pips" aria-label="{match.gamesWon[s]} games won">
								{#each Array.from({ length: winsNeeded(live.setup.rules.bestOf) }) as _, i (i)}
									<span class="pip" class:on={i < match.gamesWon[s]}></span>
								{/each}
							</span>
						{/if}
						<span class="serve" class:hidden={match.server.side !== s}>
							<span class="ball" aria-hidden="true"></span>
							{doubles ? serverName : 'Serving'}
						</span>
					</button>
				{/each}
			</div>

			{#if match.games.length}
				<p class="past num muted">
					{#each match.games as g, i (i)}<span
							><span class="g">G{i + 1}</span> {g[order[0]!]}–{g[order[1]!]}</span
						>{/each}
				</p>
			{/if}

			<div class="row tools">
				<button
					type="button"
					class="btn btn-tonal"
					disabled={!live.events.length}
					onclick={() => live.undo()}
				>
					<Icon name="undo" size="1.1rem" /> Undo
				</button>
				<button
					type="button"
					class="btn btn-ghost"
					onclick={() => (turned = !turned)}
					title="Swap which half is on which side of the screen"
				>
					<Icon path="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" size="1.1rem" /> Swap
				</button>
				{@render abandonButton()}
			</div>
		</div>
	{/if}
{:else if players.length < 2}
	<div class="card empty">
		<p>You need at least two players before you can record a match.</p>
		<a class="btn btn-primary" href="/players">Add players</a>
	</div>
{:else}
	<p class="hint muted">Tap to add a player, tap again to switch sides. Two each for doubles.</p>
	<SidePicker {players} {rating} bind:sides sideCount={2} maxPerSide={2} />

	<section class="card options" aria-label="Match options">
		<div class="option">
			<span class="label">Points</span>
			<div class="segs">
				{@render segment('11', pointsToWin === 11, () => (pointsToWin = 11))}
				{@render segment('21', pointsToWin === 21, () => (pointsToWin = 21))}
			</div>
		</div>
		<div class="option">
			<span class="label">Best of</span>
			<div class="segs">
				{#each [1, 3, 5, 7] as const as n (n)}
					{@render segment(String(n), bestOf === n, () => pickBestOf(n))}
				{/each}
			</div>
		</div>
		{#if step === 'setup'}
			<div class="option">
				<span class="label">First serve</span>
				<div class="segs serve-pick">
					{#each [0, 1] as const as s (s)}
						{@render segment(sideName(sides[s], s), firstServer === s, () => (firstServer = s))}
					{/each}
					<button
						type="button"
						class="seg toss"
						title="Toss for serve"
						aria-label="Toss for serve"
						onclick={() => (firstServer = Math.random() < 0.5 ? 0 : 1)}
					>
						<Icon path="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" size="1rem" />
					</button>
				</div>
			</div>
		{/if}
	</section>

	{#if step === 'setup'}
		<div class="actions">
			<button type="button" class="btn btn-primary big" disabled={!ready} onclick={start}
				>Start match</button
			>
			<button type="button" class="btn btn-ghost" onclick={() => (step = 'scores')}
				>Enter scores instead</button
			>
		</div>
	{:else}
		<section class="card games" aria-label="Game scores">
			<div class="game-row head">
				<span></span>
				<span class="team" style:--side="var(--side-0)">{sideName(sides[0], 0)}</span>
				<span></span>
				<span class="team" style:--side="var(--side-1)">{sideName(sides[1], 1)}</span>
				<span></span>
			</div>
			{#each rows as row, i (i)}
				<div class="game-row">
					<span class="muted">G{i + 1}</span>
					<input
						type="number"
						inputmode="numeric"
						min="0"
						max="99"
						bind:value={row[0]}
						aria-label="Game {i + 1}, {sideName(sides[0], 0)}"
					/>
					<span class="muted dash">–</span>
					<input
						type="number"
						inputmode="numeric"
						min="0"
						max="99"
						bind:value={row[1]}
						aria-label="Game {i + 1}, {sideName(sides[1], 1)}"
					/>
					<button
						type="button"
						class="btn btn-ghost remove"
						aria-label="Remove game {i + 1}"
						disabled={rows.length <= 1}
						onclick={() => (rows = rows.filter((_, j) => j !== i))}>×</button
					>
				</div>
			{/each}
			<button
				type="button"
				class="btn btn-ghost add"
				disabled={rows.length >= bestOf}
				onclick={() => (rows = [...rows, [null, null]])}>+ Add game</button
			>

			{#if quick.message}
				<p class="error check" role="alert">{quick.message}</p>
			{:else if quick.winner !== null}
				<p class="notice check">{sideName(sides[quick.winner], quick.winner)} won.</p>
			{/if}
		</section>

		<div class="actions">
			{@render noteField()}
			<button
				type="button"
				class="btn btn-primary big"
				disabled={!ready || quick.winner === null || submitting}
				onclick={saveScores}
			>
				{submitting ? 'Saving…' : 'Save result'}
			</button>
			<button type="button" class="btn btn-ghost" onclick={() => (step = 'setup')}
				>Score it live instead</button
			>
		</div>
	{/if}
{/if}

{#snippet abandonButton()}
	{#if confirmAbandon}
		<span class="confirm">
			<button type="button" class="btn btn-danger" onclick={abandon}>Yes, abandon</button>
			<button type="button" class="btn btn-ghost" onclick={() => (confirmAbandon = false)}
				>Keep</button
			>
		</span>
	{:else}
		<button
			type="button"
			class="btn btn-ghost"
			disabled={submitting}
			onclick={() => (confirmAbandon = true)}>Abandon</button
		>
	{/if}
{/snippet}

<style>
	.hint {
		margin: -0.4rem 0 0.8rem;
		font-size: 0.85rem;
	}

	/* --- Setup --- */

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		margin-top: 1.25rem;
	}

	.option {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.label {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.segs {
		display: flex;
		gap: 0.25rem;
		padding: 0.2rem;
		background: var(--surface-2);
		border-radius: var(--r-md);
		min-width: 0;
	}

	.seg {
		min-width: 2.75rem;
		min-height: 2.5rem;
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: 0;
		border-radius: var(--r-sm);
		font-weight: 600;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.seg[aria-pressed='true'] {
		background: var(--accent-fill);
		color: var(--accent-on-fill);
	}

	.seg:hover:not([aria-pressed='true']) {
		background: var(--surface-3);
	}

	.serve-pick {
		flex: 1 1 14rem;
		max-width: 26rem;
	}

	.serve-pick .seg:not(.toss) {
		flex: 1;
		max-width: 12rem;
	}

	.toss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		padding: 0;
		color: var(--muted);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.big {
		padding: 0.95rem 1.1rem;
		font-size: 1.05rem;
	}

	.add-note {
		align-self: flex-start;
		padding: 0.4rem 0;
		border: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	/* --- Quick entry --- */

	.games {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.game-row {
		display: grid;
		grid-template-columns: 2rem 1fr 1rem 1fr 2.5rem;
		align-items: center;
		gap: 0.4rem;
	}

	.game-row.head {
		font-size: 0.8rem;
		font-weight: 700;
	}

	.team {
		color: var(--side);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.game-row input {
		padding: 0.6rem 0.5rem;
		text-align: center;
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}

	.dash {
		text-align: center;
	}

	.remove {
		padding: 0.5rem 0;
		border: 0;
		font-size: 1.2rem;
		color: var(--muted);
	}

	.add {
		align-self: flex-start;
		padding: 0.4rem 0.2rem;
		border: 0;
		color: var(--accent);
		font-size: 0.9rem;
	}

	.check {
		margin: 0.25rem 0 0;
	}

	/* --- Scorer --- */

	.scorer {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 2rem;
		font-size: 0.9rem;
	}

	.banner {
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.banner.deuce {
		background: var(--secondary-soft);
		color: var(--secondary-on-soft);
	}

	.banner.game {
		background: var(--accent-soft);
		color: var(--accent-on-soft);
	}

	.banner.match {
		background: var(--game-pingpong-container);
		color: var(--game-pingpong-on-container);
		box-shadow: inset 0 0 0 2px var(--game-pingpong);
	}

	.ends {
		margin: 0;
		text-align: center;
	}

	.courts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.court {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		min-width: 0;
		height: clamp(15rem, 52dvh, 30rem);
		padding: 1rem 0.5rem;
		background: var(--side);
		color: var(--on-side);
		border: 0;
		border-radius: var(--r-xl);
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		transition:
			transform 0.08s ease,
			filter 0.15s;
	}

	.court:hover {
		filter: brightness(1.05);
	}

	.court:active {
		transform: scale(0.98);
		filter: brightness(0.94);
	}

	.who {
		max-width: 100%;
		font-size: 1rem;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.score {
		font-size: clamp(5.5rem, 30vw, 11rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.04em;
	}

	.pips {
		display: flex;
		gap: 0.4rem;
	}

	.pip {
		width: 0.7rem;
		height: 0.7rem;
		border: 2px solid currentColor;
		border-radius: 50%;
		opacity: 0.55;
	}

	.pip.on {
		background: currentColor;
		opacity: 1;
	}

	.serve {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
		padding: 0.3rem 0.7rem;
		background: color-mix(in oklab, var(--on-side) 16%, transparent);
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 700;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.serve.hidden {
		visibility: hidden;
	}

	.ball {
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		background: currentColor;
		border-radius: 50%;
	}

	.past {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem 0.9rem;
		margin: 0;
		font-size: 0.9rem;
	}

	.past .g {
		font-size: 0.75rem;
		font-weight: 700;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tools .btn {
		flex: 1;
		padding-inline: 0.5rem;
	}

	.confirm {
		display: flex;
		flex: 2 1 100%;
		gap: 0.5rem;
	}

	.confirm .btn {
		flex: 1;
		padding-inline: 0.5rem;
		white-space: nowrap;
	}

	/* --- Finished --- */

	.summary {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 -0.6rem;
	}

	.summary h2 {
		font-size: 1.5rem;
	}

	.board {
		width: 100%;
		border-collapse: collapse;
		font-size: 1rem;
	}

	.board th,
	.board td {
		padding: 0.5rem 0.35rem;
		text-align: center;
		border-bottom: 1px solid var(--border);
	}

	.board thead th {
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.board tbody th {
		max-width: 9rem;
		padding-left: 0.6rem;
		border-left: 4px solid var(--side);
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.board tr.won th {
		font-weight: 800;
	}

	.board td {
		color: var(--muted);
	}

	.board td.took {
		color: var(--text);
		font-weight: 800;
	}

	.save-area {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.save-area .row .btn {
		flex: 1;
	}

	@media (min-width: 720px) {
		.courts {
			gap: 0.75rem;
		}

		.who {
			font-size: 1.2rem;
		}
	}
</style>
