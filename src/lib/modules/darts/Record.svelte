<!--
	The darts scorer: one phone by the oche. Pick players and rules, then enter
	each turn as a total (or dart by dart). Every turn is kept on the device and
	replayed through the X01 engine, so undo is free and the server checks the
	exact same throws when the result is saved.
-->
<script lang="ts">
	import SidePicker from '$lib/components/SidePicker.svelte';
	import { userMessage } from '$lib/core/errors';
	import { keepAwake, LiveMatch } from '$lib/live/live-match.svelte';
	import type { RecordProps } from '../types';
	import {
		canCheckout,
		checkoutSuggestion,
		dartLabel,
		isFinishable,
		possibleTotal,
		replay,
		START_SCORES,
		throwDarts,
		type Dart,
		type MatchState,
		type Multiplier,
		type SideState,
		type StartScore,
		type Thrower,
		type Turn,
		type TurnResult,
		type X01Setup
	} from './x01';

	let { players, rating, submit, submitting, error }: RecordProps = $props();

	interface Game {
		rules: X01Setup;
		sides: number[][];
	}

	const live = new LiveMatch<Game, Turn>('darts');

	/* --- Setup ------------------------------------------------------------- */

	type Format = 'solo' | 'doubles';
	const LEG_CHOICES = [1, 2, 3, 5] as const;

	let format = $state<Format>('solo');
	let picked = $state<number[][]>([]);
	let startScore = $state<StartScore>(501);
	let doubleOut = $state(true);
	let doubleIn = $state(false);
	let legsToWin = $state(2);

	const canStart = $derived(picked.length >= 2 && picked.every((side) => side.length > 0));

	function setFormat(next: Format) {
		if (next === format) return;
		format = next;
		picked = next === 'solo' ? [] : [[], []];
	}

	function start() {
		if (!canStart) return;
		const sides = picked.map((side) => [...side]);
		resetEntry();
		live.start({
			rules: {
				startScore,
				doubleIn,
				doubleOut,
				legsToWin,
				layout: sides.map((side) => side.length)
			},
			sides
		});
	}

	/* --- The match --------------------------------------------------------- */

	const game = $derived(live.setup);

	/** The whole match, replayed from the saved turns. */
	const replayed = $derived.by((): { state: MatchState | null; problem: string | null } => {
		if (!game) return { state: null, problem: null };
		try {
			return { state: replay(game.rules, game.sides, live.events), problem: null };
		} catch (e) {
			return { state: null, problem: userMessage(e) ?? 'This saved game could not be read.' };
		}
	});
	const match = $derived(replayed.state);
	const current = $derived(match?.current ?? null);
	const currentSide = $derived(current && match ? (match.sides[current.side] ?? null) : null);

	const names = $derived(new Map(players.map((p) => [p.id, p.name])));
	const nameOf = (id: number | undefined): string =>
		id === undefined ? 'Player' : (names.get(id) ?? 'Player');
	const playerName = (side: number, player: number): string => nameOf(game?.sides[side]?.[player]);
	const sideName = (side: number): string => (game?.sides[side] ?? []).map(nameOf).join(' & ');
	const throwerName = (t: Thrower): string => playerName(t.side, t.player);

	const sideAverage = (side: SideState): string => {
		const darts = side.players.reduce((n, p) => n + p.darts, 0);
		const points = side.players.reduce((n, p) => n + p.points, 0);
		return darts ? ((points / darts) * 3).toFixed(1) : '–';
	};
	const average = (points: number, darts: number): string =>
		darts ? ((points / darts) * 3).toFixed(1) : '–';

	/* --- Entering a turn --------------------------------------------------- */

	let inputMode = $state<'total' | 'darts'>('total');
	let typed = $state('');
	let pending = $state<Dart[]>([]);
	let modifier = $state<Multiplier>(1);
	/** A total that would finish the leg, waiting for how many darts it took. */
	let finishing = $state<number | null>(null);
	let problem = $state<string | null>(null);
	let confirmAbandon = $state(false);
	let saved = $state(false);

	/** The darts entered so far this turn, scored. */
	const preview = $derived.by((): TurnResult | null => {
		if (!game || !currentSide || !pending.length) return null;
		try {
			return throwDarts(currentSide.remaining, currentSide.opened, pending, game.rules);
		} catch {
			return null;
		}
	});
	const remainingNow = $derived(preview?.remaining ?? currentSide?.remaining ?? 0);
	const openedNow = $derived(preview?.opened ?? currentSide?.opened ?? false);
	const dartsLeft = $derived(inputMode === 'darts' ? 3 - pending.length : 3);
	const suggestion = $derived(
		game && openedNow
			? checkoutSuggestion(remainingNow, { doubleOut: game.rules.doubleOut, dartsLeft })
			: null
	);
	const onAFinish = $derived(
		!!game &&
			!!currentSide &&
			currentSide.opened &&
			isFinishable(currentSide.remaining, game.rules.doubleOut)
	);

	const typedValue = $derived(typed === '' ? null : Number(typed));
	const typedImpossible = $derived(typedValue !== null && !possibleTotal(typedValue));

	const wouldBust = (total: number): boolean => {
		if (!game || !currentSide) return false;
		const after = currentSide.remaining - total;
		return after < 0 || (game.rules.doubleOut && after === 1);
	};

	const enterLabel = $derived.by(() => {
		if (typedValue === null) return 'Enter';
		if (typedImpossible) return 'Enter';
		if (currentSide && typedValue === currentSide.remaining) return 'Checkout';
		if (wouldBust(typedValue)) return 'Bust';
		return 'Enter';
	});

	const QUICK = [26, 41, 45, 60, 81, 85, 100, 140, 180] as const;

	function resetEntry() {
		typed = '';
		pending = [];
		modifier = 1;
		finishing = null;
		problem = null;
	}

	/** Checks a turn against the engine before it is kept, so a bad tap never corrupts the game. */
	function commit(turn: Turn) {
		if (!game) return;
		try {
			replay(game.rules, game.sides, [...live.events, turn]);
		} catch (e) {
			problem = userMessage(e) ?? 'That turn could not be scored.';
			return;
		}
		resetEntry();
		live.push(turn);
	}

	function pressDigit(digit: string) {
		problem = null;
		const next = typed === '0' ? digit : typed + digit;
		if (next.length > 3 || Number(next) > 180) return;
		typed = next;
	}

	function backspace() {
		problem = null;
		typed = typed.slice(0, -1);
	}

	function submitTotal(total: number) {
		if (!game || !currentSide) return;
		if (!possibleTotal(total)) {
			problem = `${total} can't be scored with three darts.`;
			return;
		}
		const { doubleOut } = game.rules;
		if (total > 0 && total === currentSide.remaining) {
			const options = [1, 2, 3].filter((n) => canCheckout(total, n, doubleOut));
			// Reaching zero any other way (168 without a double) is a bust.
			if (!options.length) return commit({ total, doubleFinish: false });
			if (!doubleOut && options.length === 1)
				return commit({ total, darts: options[0] as 1 | 2 | 3 });
			finishing = total;
			return;
		}
		commit({ total });
	}

	const finishOptions = $derived(
		finishing !== null && game
			? [1, 2, 3].filter((n) => canCheckout(finishing!, n, game.rules.doubleOut))
			: []
	);

	function finishWith(darts: number) {
		if (finishing === null || !game) return;
		const total = finishing;
		const count = darts as 1 | 2 | 3;
		commit(
			game.rules.doubleOut ? { total, darts: count, doubleFinish: true } : { total, darts: count }
		);
	}

	function addDart(segment: number, multiplier: Multiplier) {
		if (!game || !currentSide) return;
		problem = null;
		const next: Dart[] = [...$state.snapshot(pending), { segment, multiplier }];
		modifier = 1;
		let result: TurnResult;
		try {
			result = throwDarts(currentSide.remaining, currentSide.opened, next, game.rules);
		} catch (e) {
			problem = userMessage(e) ?? 'That dart could not be scored.';
			return;
		}
		if (result.done) commit({ darts: next });
		else pending = next;
	}

	function undo() {
		problem = null;
		finishing = null;
		if (pending.length) {
			pending = pending.slice(0, -1);
			return;
		}
		typed = '';
		live.undo();
	}

	function abandon() {
		// Keep the line-up so a rematch is one tap away.
		if (game) {
			picked = game.sides.map((side) => [...side]);
			format = game.sides.some((side) => side.length > 1) ? 'doubles' : 'solo';
		}
		confirmAbandon = false;
		resetEntry();
		live.clear();
	}

	async function save() {
		if (!game) return;
		const ok = await submit({
			sides: $state.snapshot(game.sides),
			details: { setup: $state.snapshot(game.rules), turns: $state.snapshot(live.events) }
		});
		if (ok) {
			saved = true;
			live.clear();
		}
	}

	function onKey(event: KeyboardEvent) {
		if (!match || match.finished || inputMode !== 'total' || confirmAbandon) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
			return;
		if (finishing !== null) {
			if (event.key === 'Escape') finishing = null;
			else if (/^[123]$/.test(event.key) && finishOptions.includes(Number(event.key)))
				finishWith(Number(event.key));
			else return;
			event.preventDefault();
			return;
		}
		if (/^[0-9]$/.test(event.key)) pressDigit(event.key);
		else if (event.key === 'Backspace') backspace();
		else if (event.key === 'Enter' && typedValue !== null && !typedImpossible)
			submitTotal(typedValue);
		else return;
		event.preventDefault();
	}

	/* --- Leg won toast ----------------------------------------------------- */

	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	/** Legs already announced; starts at whatever a restored game has. */
	let announced: number | null = null;

	$effect(() => {
		const count = match?.legs.length ?? 0;
		const finished = match?.finished ?? false;
		const leg = match?.legs[count - 1];
		if (announced !== null && count > announced && !finished && leg) {
			toast = `${playerName(leg.winner, leg.player)} wins leg ${count} · ${leg.checkout} checkout in ${leg.darts} darts`;
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => (toast = null), 3500);
		}
		// The summary says who won; an old leg toast would only cover it.
		if (finished) toast = null;
		announced = count;
	});

	$effect(() => () => clearTimeout(toastTimer));

	/* --- Result ------------------------------------------------------------ */

	const standings = $derived(
		match?.placements
			? match.sides
					.map((side, i) => ({ side, i, placement: match.placements![i]! }))
					.sort((a, b) => a.placement - b.placement || a.i - b.i)
			: []
	);
	const winnerIndex = $derived(standings[0]?.i ?? null);
	const resultTitle = $derived.by(() => {
		if (!match || winnerIndex === null) return '';
		const legs = match.sides.map((s) => s.legs);
		const score = legs.length === 2 ? ` ${legs[winnerIndex]}–${legs[1 - winnerIndex]}` : '';
		return `${sideName(winnerIndex)} win${game?.sides[winnerIndex]?.length === 1 ? 's' : ''}${score}`;
	});
	const ordinal = (n: number): string =>
		`${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
</script>

<svelte:window onkeydown={onKey} />

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if saved}
	<p class="notice" role="status">Result saved. Loading the rankings…</p>
{:else if players.length < 2}
	<div class="card empty">
		<p>You need at least two players before you can play darts.</p>
		<a class="btn btn-primary" href="/players">Add players</a>
	</div>
{:else if !game}
	<!-- Setup -->
	<div class="setup">
		<div class="seg" role="group" aria-label="Format">
			<button type="button" aria-pressed={format === 'solo'} onclick={() => setFormat('solo')}
				>Singles / free-for-all</button
			>
			<button type="button" aria-pressed={format === 'doubles'} onclick={() => setFormat('doubles')}
				>Doubles</button
			>
		</div>

		<p class="hint muted">
			{#if format === 'solo'}
				Tap players in throwing order, up to eight.
			{:else}
				Tap once for Team A, twice for Team B. Partners throw in the order you add them.
			{/if}
		</p>

		{#if format === 'solo'}
			<SidePicker {players} {rating} bind:sides={picked} mode="solo" maxSides={8} />
		{:else}
			<SidePicker
				{players}
				{rating}
				bind:sides={picked}
				mode="teams"
				sideCount={2}
				maxPerSide={2}
			/>
		{/if}

		<h3 class="section-label">Game</h3>
		<div class="rules card">
			<div class="rule">
				<span>Start from</span>
				<div class="seg small" role="group" aria-label="Start score">
					{#each START_SCORES as score (score)}
						<button
							type="button"
							class="num"
							aria-pressed={startScore === score}
							onclick={() => (startScore = score)}>{score}</button
						>
					{/each}
				</div>
			</div>
			<div class="rule">
				<span>First to</span>
				<div class="seg small" role="group" aria-label="Legs to win">
					{#each LEG_CHOICES as legs (legs)}
						<button
							type="button"
							class="num"
							aria-pressed={legsToWin === legs}
							onclick={() => (legsToWin = legs)}>{legs}</button
						>
					{/each}
				</div>
			</div>
			<label class="rule toggle">
				<span>Double out<small class="muted">Finish on a double or the bull</small></span>
				<input type="checkbox" role="switch" bind:checked={doubleOut} />
			</label>
			<label class="rule toggle">
				<span>Double in<small class="muted">Scoring starts with a double</small></span>
				<input type="checkbox" role="switch" bind:checked={doubleIn} />
			</label>
		</div>

		<button type="button" class="btn btn-primary start" disabled={!canStart} onclick={start}>
			{canStart
				? `Start ${startScore} · first to ${legsToWin} leg${legsToWin === 1 ? '' : 's'}`
				: format === 'solo'
					? 'Pick at least two players'
					: 'Put a player on each team'}
		</button>
	</div>
{:else if !match}
	<div class="card empty">
		<p>{replayed.problem}</p>
		<button type="button" class="btn btn-danger" onclick={abandon}>Discard this game</button>
	</div>
{:else}
	<div class="play" {@attach keepAwake}>
		<div class="board" class:many={match.sides.length > 2} class:crowd={match.sides.length > 4}>
			{#each match.sides as side, i (i)}
				{@const active = current?.side === i}
				<section
					class="score"
					class:active
					class:winner={match.finished && match.placements?.[i] === 1}
					style:--side="var(--side-{i % 8})"
					style:--on-side="var(--on-side-{i % 8})"
					aria-current={active ? 'true' : undefined}
				>
					<header>
						<span class="who">
							{#each game.sides[i] ?? [] as id, p (id)}
								{#if p > 0}<span class="amp">&nbsp;&amp;&nbsp;</span>{/if}
								<span class:throwing={active && current?.player === p}>{nameOf(id)}</span>
							{/each}
						</span>
						{#if game.rules.legsToWin > 1}
							<span class="pips" aria-label="{side.legs} legs">
								{#each Array.from({ length: game.rules.legsToWin }) as _, k (k)}
									<span class="pip" class:won={k < side.legs}></span>
								{/each}
							</span>
						{/if}
					</header>
					<div class="remaining num">{active && preview ? remainingNow : side.remaining}</div>
					<footer class="num">
						<span>avg {sideAverage(side)}</span>
						{#if side.last}
							<span class:bust={side.last.bust}
								>{side.last.bust ? 'Bust' : `last ${side.last.scored}`}</span
							>
						{/if}
					</footer>
				</section>
			{/each}
		</div>

		{#if !match.finished && current}
			<div class="status">
				<div class="turn">
					<span class="muted">Leg {match.leg}</span>
					<strong>{throwerName(current)}</strong>
					<span class="muted">to throw</span>
				</div>
				{#if !openedNow}
					<span class="tag">Needs a double to start</span>
				{:else if suggestion}
					<span class="route" aria-label="Checkout route">
						{#each suggestion as step, k (k)}<span class="step num">{step}</span>{/each}
					</span>
				{:else if remainingNow <= 180}
					<span class="tag">No checkout</span>
				{/if}
			</div>
		{/if}

		{#if problem}<p class="error" role="alert">{problem}</p>{/if}

		{#if match.finished}
			<section class="card summary">
				<h2>{resultTitle}</h2>
				<ol class="placings">
					{#each standings as row (row.i)}
						<li style:--side="var(--side-{row.i % 8})">
							<span class="place num">{ordinal(row.placement)}</span>
							<span class="name">{sideName(row.i)}</span>
							<span class="num muted">{row.side.legs} leg{row.side.legs === 1 ? '' : 's'}</span>
						</li>
					{/each}
				</ol>

				<div class="stat-cards">
					{#each match.sides as side, i (i)}
						{#each side.players as stats, p (p)}
							<div class="stat-card" style:--side="var(--side-{i % 8})">
								<h3>{playerName(i, p)}</h3>
								<dl>
									<div>
										<dt>Average</dt>
										<dd class="num">{average(stats.points, stats.darts)}</dd>
									</div>
									<div>
										<dt>First 9</dt>
										<dd class="num">{average(stats.first9Points, stats.first9Darts)}</dd>
									</div>
									<div>
										<dt>180s</dt>
										<dd class="num">{stats.oneEighties}</dd>
									</div>
									<div>
										<dt>Top out</dt>
										<dd class="num">{stats.highestCheckout || '–'}</dd>
									</div>
									<div>
										<dt>Checkout</dt>
										<dd class="num">
											{stats.checkoutChances
												? `${Math.round((stats.checkoutHits / stats.checkoutChances) * 100)}%`
												: '–'}
										</dd>
									</div>
									<div>
										<dt>Best leg</dt>
										<dd class="num">{stats.bestLeg ?? '–'}</dd>
									</div>
								</dl>
							</div>
						{/each}
					{/each}
				</div>

				<button type="button" class="btn btn-primary save" disabled={submitting} onclick={save}>
					{submitting ? 'Saving…' : 'Save result'}
				</button>
			</section>
		{:else}
			<div class="calc">
				<div class="seg mode" role="group" aria-label="Entry">
					<button
						type="button"
						aria-pressed={inputMode === 'total'}
						onclick={() => ((inputMode = 'total'), (pending = []))}>Turn total</button
					>
					<button
						type="button"
						aria-pressed={inputMode === 'darts'}
						onclick={() => ((inputMode = 'darts'), (typed = ''))}>Dart by dart</button
					>
				</div>

				{#if inputMode === 'total'}
					<div class="display" class:invalid={typedImpossible}>
						<span class="typed num" aria-live="polite">{typed || '0'}</span>
						<span class="muted note">
							{#if typedImpossible}Not possible with three darts{:else if typedValue !== null && wouldBust(typedValue)}That's
								a bust{:else}Type the score for this turn{/if}
						</span>
					</div>

					<div class="quick">
						{#each QUICK as n (n)}
							<button type="button" class="key num" onclick={() => submitTotal(n)}>{n}</button>
						{/each}
						<button type="button" class="key bust-key" onclick={() => submitTotal(0)}
							>0 · Bust</button
						>
					</div>

					<div class="keypad">
						{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit (digit)}
							<button type="button" class="key big num" onclick={() => pressDigit(digit)}
								>{digit}</button
							>
						{/each}
						<button
							type="button"
							class="key big"
							aria-label="Delete"
							onclick={backspace}
							disabled={!typed}>⌫</button
						>
						<button type="button" class="key big num" onclick={() => pressDigit('0')}>0</button>
						<button
							type="button"
							class="key big enter"
							disabled={typedValue === null || typedImpossible}
							onclick={() => typedValue !== null && submitTotal(typedValue)}
						>
							{enterLabel}
						</button>
					</div>
					{#if onAFinish && currentSide}
						<button
							type="button"
							class="btn btn-tonal checkout"
							onclick={() => submitTotal(currentSide.remaining)}
						>
							Checked out {currentSide.remaining}
						</button>
					{/if}
				{:else}
					<div class="display darts">
						<span class="slots">
							{#each [0, 1, 2] as k (k)}
								{@const dart = pending[k]}
								<span class="slot num" class:filled={!!dart}>{dart ? dartLabel(dart) : ''}</span>
							{/each}
						</span>
						<span class="muted note num">
							{#if preview}{preview.scored} scored{:else}Tap each dart{/if}
						</span>
					</div>

					<div class="seg mods" role="group" aria-label="Multiplier">
						<button type="button" aria-pressed={modifier === 1} onclick={() => (modifier = 1)}
							>Single</button
						>
						<button
							type="button"
							aria-pressed={modifier === 2}
							onclick={() => (modifier = modifier === 2 ? 1 : 2)}>Double</button
						>
						<button
							type="button"
							aria-pressed={modifier === 3}
							onclick={() => (modifier = modifier === 3 ? 1 : 3)}>Treble</button
						>
					</div>

					<div class="segments" class:double={modifier === 2} class:treble={modifier === 3}>
						{#each Array.from({ length: 20 }, (_, k) => k + 1) as n (n)}
							<button type="button" class="key num" onclick={() => addDart(n, modifier)}>
								{modifier === 1 ? n : `${modifier === 2 ? 'D' : 'T'}${n}`}
							</button>
						{/each}
					</div>
					<div class="specials">
						<button type="button" class="key" onclick={() => addDart(25, 1)}>25</button>
						<button type="button" class="key" onclick={() => addDart(25, 2)}>Bull</button>
						<button type="button" class="key" onclick={() => addDart(0, 1)}>Miss</button>
					</div>
				{/if}
			</div>
		{/if}

		<div class="actions">
			<button
				type="button"
				class="btn btn-ghost"
				onclick={undo}
				disabled={!live.events.length && !pending.length}
			>
				Undo{pending.length ? ' dart' : ''}
			</button>
			{#if confirmAbandon}
				<span class="confirm">
					<span class="muted">Abandon this game?</span>
					<button type="button" class="btn btn-ghost" onclick={() => (confirmAbandon = false)}
						>Keep playing</button
					>
					<button type="button" class="btn btn-danger" onclick={abandon}>Abandon</button>
				</span>
			{:else}
				<button type="button" class="btn btn-ghost" onclick={() => (confirmAbandon = true)}
					>Abandon</button
				>
			{/if}
		</div>
	</div>

	{#if finishing !== null}
		<div class="scrim" role="presentation" onclick={() => (finishing = null)}></div>
		<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="finish-title">
			<h2 id="finish-title">Checkout {finishing}</h2>
			<p class="muted">How many darts did it take?</p>
			<div class="finish-darts">
				{#each [1, 2, 3] as n (n)}
					<button
						type="button"
						class="btn btn-primary"
						disabled={!finishOptions.includes(n)}
						onclick={() => finishWith(n)}
					>
						{n} dart{n === 1 ? '' : 's'}
					</button>
				{/each}
			</div>
			{#if game.rules.doubleOut}
				<p class="muted small">Only counts if the last dart was a double or the bull.</p>
				<button
					type="button"
					class="btn btn-danger wide"
					onclick={() => finishing !== null && commit({ total: finishing, doubleFinish: false })}
				>
					Not on a double: bust
				</button>
			{/if}
			<button type="button" class="btn btn-ghost wide" onclick={() => (finishing = null)}
				>Cancel</button
			>
		</div>
	{/if}

	{#if toast}
		<div class="toast" role="status">{toast}</div>
	{/if}
{/if}

<style>
	/* --- Shared bits ------------------------------------------------------ */

	.seg {
		display: grid;
		grid-auto-columns: 1fr;
		grid-auto-flow: column;
		gap: 0.25rem;
		padding: 0.25rem;
		background: var(--surface-2);
		border-radius: var(--r-md);
	}

	.seg button {
		min-height: 2.5rem;
		padding: 0.4rem 0.6rem;
		background: transparent;
		border: 0;
		border-radius: calc(var(--r-md) - 0.2rem);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}

	.seg button[aria-pressed='true'] {
		background: var(--game-darts-container);
		color: var(--game-darts-on-container);
	}

	.seg.small button {
		min-height: 2.2rem;
		padding: 0.3rem 0.5rem;
	}

	.key {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2.9rem;
		padding: 0.3rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
	}

	.key:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.key:active:not(:disabled) {
		background: var(--surface-3);
	}

	.key:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* --- Setup ------------------------------------------------------------ */

	.hint {
		margin: 0.6rem 0 0.8rem;
		font-size: 0.85rem;
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.rule {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.rule > span:first-child {
		white-space: nowrap;
	}

	.rule .seg {
		flex: 0 1 15rem;
	}

	.toggle {
		cursor: pointer;
	}

	.toggle span {
		display: flex;
		flex-direction: column;
		white-space: normal;
	}

	.toggle small {
		font-size: 0.78rem;
		font-weight: 400;
	}

	.toggle input {
		width: 1.4rem;
		height: 1.4rem;
		flex-shrink: 0;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.start {
		width: 100%;
		margin-top: 1.25rem;
		padding: 0.95rem;
		font-size: 1rem;
	}

	/* --- Scoreboard ------------------------------------------------------- */

	.play {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.board {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	@media (min-width: 40rem) {
		.board.crowd {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.score {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		padding: 0.6rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: 3px solid var(--side);
		border-radius: var(--r-lg);
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.score.active {
		background: color-mix(in oklab, var(--side) 14%, var(--surface));
		border-color: var(--side);
		box-shadow: 0 0 0 1px var(--side);
	}

	.score.winner {
		background: color-mix(in oklab, var(--side) 18%, var(--surface));
	}

	.score header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		min-width: 0;
	}

	.who {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}

	.who .throwing {
		color: var(--text);
		text-decoration: underline;
		text-decoration-color: var(--side);
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
	}

	.score.active .who {
		color: var(--text);
	}

	.pips {
		display: flex;
		flex-shrink: 0;
		gap: 0.2rem;
	}

	.pip {
		width: 0.5rem;
		height: 0.5rem;
		border: 1.5px solid var(--side);
		border-radius: 50%;
	}

	.pip.won {
		background: var(--side);
	}

	.remaining {
		font-size: clamp(2.6rem, 14vw, 3.6rem);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}

	.many .remaining {
		font-size: clamp(1.8rem, 9vw, 2.4rem);
	}

	.score footer {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.score footer .bust {
		color: var(--loss);
		font-weight: 700;
	}

	/* --- Status line ------------------------------------------------------ */

	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem 0.75rem;
		min-height: 2.2rem;
	}

	.turn {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		font-size: 0.95rem;
	}

	.route {
		display: flex;
		gap: 0.3rem;
	}

	.step {
		padding: 0.25rem 0.55rem;
		background: var(--game-darts-container);
		color: var(--game-darts-on-container);
		border-radius: var(--r-sm);
		font-size: 0.9rem;
		font-weight: 700;
	}

	.tag {
		padding: 0.2rem 0.55rem;
		background: var(--surface-2);
		border-radius: var(--r-sm);
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
	}

	/* --- Calculator ------------------------------------------------------- */

	.calc {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 3.6rem;
		padding: 0.35rem 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
	}

	.display.invalid {
		border-color: var(--loss);
	}

	.display.invalid .note {
		color: var(--loss);
	}

	.typed {
		font-size: 2.2rem;
		font-weight: 800;
	}

	.note {
		font-size: 0.8rem;
		text-align: right;
	}

	.quick {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.35rem;
	}

	.quick .key {
		min-height: 2.6rem;
		font-size: 0.95rem;
		background: var(--surface-2);
		border-color: transparent;
	}

	.quick .bust-key {
		font-size: 0.8rem;
		color: var(--loss);
	}

	.keypad {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}

	.key.big {
		min-height: 3.5rem;
		font-size: 1.5rem;
	}

	.key.enter {
		background: var(--accent-fill);
		border-color: var(--accent-fill);
		color: var(--accent-on-fill);
		font-size: 1.05rem;
	}

	.key.enter:hover:not(:disabled) {
		background: color-mix(in oklab, var(--accent-fill) 88%, var(--text));
	}

	.checkout {
		width: 100%;
	}

	.slots {
		display: flex;
		gap: 0.35rem;
	}

	.slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.4rem;
		height: 2.4rem;
		border: 1.5px dashed var(--border);
		border-radius: var(--r-sm);
		font-weight: 700;
	}

	.slot.filled {
		background: var(--game-darts-container);
		color: var(--game-darts-on-container);
		border: 0;
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.35rem;
	}

	.segments.double .key,
	.segments.treble .key {
		background: color-mix(in oklab, var(--game-darts) 10%, var(--surface));
		border-color: color-mix(in oklab, var(--game-darts) 40%, var(--border));
	}

	.specials {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
	}

	/* --- Actions ---------------------------------------------------------- */

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.actions .btn {
		padding: 0.55rem 0.9rem;
	}

	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
		font-size: 0.9rem;
	}

	/* --- Summary ---------------------------------------------------------- */

	.summary {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.summary h2 {
		font-size: 1.3rem;
	}

	.placings {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.placings li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		background: color-mix(in oklab, var(--side) 10%, var(--surface));
		border-left: 3px solid var(--side);
		border-radius: var(--r-sm);
	}

	.placings .place {
		width: 2.2rem;
		font-weight: 800;
	}

	.placings .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}

	.stat-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.5rem;
	}

	.stat-card {
		padding: 0.65rem 0.75rem;
		background: var(--surface-2);
		border-radius: var(--r-md);
	}

	.stat-card h3 {
		margin-bottom: 0.4rem;
		font-size: 0.9rem;
		color: var(--side);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem 0.5rem;
		margin: 0;
	}

	dt {
		font-size: 0.7rem;
		color: var(--muted);
	}

	dd {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
	}

	.save {
		width: 100%;
		padding: 0.95rem;
		font-size: 1rem;
	}

	/* --- Overlays --------------------------------------------------------- */

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: color-mix(in oklab, var(--bg) 40%, transparent);
		backdrop-filter: blur(2px);
	}

	.sheet {
		position: fixed;
		left: 50%;
		bottom: 0;
		z-index: 41;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: min(100%, 28rem);
		padding: 1.2rem 1rem calc(1rem + env(safe-area-inset-bottom));
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		box-shadow: var(--shadow-raised);
		transform: translateX(-50%);
	}

	@media (min-width: 40rem) {
		.sheet {
			top: 50%;
			bottom: auto;
			border-bottom: 1px solid var(--border);
			border-radius: var(--r-xl);
			transform: translate(-50%, -50%);
		}
	}

	.sheet p {
		margin: 0;
	}

	.sheet .small {
		font-size: 0.8rem;
	}

	.finish-darts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}

	.finish-darts .btn {
		padding: 0.9rem 0.4rem;
	}

	.wide {
		width: 100%;
	}

	.toast {
		position: fixed;
		left: 50%;
		top: calc(1rem + env(safe-area-inset-top));
		z-index: 50;
		width: max-content;
		max-width: calc(100% - 2rem);
		padding: 0.7rem 1rem;
		background: var(--game-darts-container);
		color: var(--game-darts-on-container);
		border-radius: var(--r-md);
		box-shadow: var(--shadow-raised);
		font-weight: 700;
		text-align: center;
		transform: translateX(-50%);
		animation: drop 0.25s ease-out;
	}

	@keyframes drop {
		from {
			opacity: 0;
			transform: translate(-50%, -0.75rem);
		}
	}
</style>
