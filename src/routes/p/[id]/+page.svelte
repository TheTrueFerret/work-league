<script>
	import { tier } from '$lib/elo.js';

	let { data } = $props();

	const p = $derived(data.player);
	const winRate = $derived(p.games ? Math.round((p.wins / p.games) * 100) : 0);

	/** Rating curve as an SVG path, scaled to whatever range this player has seen. */
	const curve = $derived.by(() => {
		const pts = data.curve;
		if (pts.length < 2) return null;

		const lo = Math.min(...pts);
		const hi = Math.max(...pts);
		const span = Math.max(hi - lo, 40);
		const mid = (hi + lo) / 2;
		const top = mid + span / 2;

		/** @param {number} i */
		const x = (i) => (i / (pts.length - 1)) * 100;
		/** @param {number} v */
		const y = (v) => ((top - v) / span) * 100;

		return {
			line: pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' '),
			area:
				`M0 ${y(pts[0]).toFixed(2)} ` +
				pts.map((v, i) => `L${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ') +
				' L100 100 L0 100 Z',
			lo,
			hi
		};
	});

	/** @param {number} n */
	const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

	/** @param {Date} at */
	const when = (at) =>
		new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>{p.name} · Pottr</title></svelte:head>

<header class="page-head">
	<div>
		<h1>{p.name}</h1>
		<p>{tier(p.rating)}{#if !p.active} · archived{/if}</p>
	</div>
	<a class="btn btn-ghost" href="/">Back</a>
</header>

<div class="card hero">
	<div class="stats">
		<div><strong class="num big">{p.rating}</strong><span>rating</span></div>
		<div><strong class="num">{p.wins}–{p.losses}</strong><span>W–L</span></div>
		<div><strong class="num">{winRate}%</strong><span>win rate</span></div>
		<div><strong class="num">{p.peak}</strong><span>peak</span></div>
	</div>

	{#if curve}
		<svg class="curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Rating over time">
			<path class="area" d={curve.area} />
			<path class="line" d={curve.line} vector-effect="non-scaling-stroke" />
		</svg>
		<div class="axis num muted"><span>{curve.lo}</span><span>{curve.hi}</span></div>
	{/if}
</div>

{#if data.opponents.length}
	<h2 class="section">Head to head</h2>
	<ul class="list">
		{#each data.opponents as o (o.name)}
			<li class="card row">
				<span>{o.name}</span>
				<span class="num">
					<span class="delta up">{o.wins}</span> – <span class="delta down">{o.losses}</span>
				</span>
			</li>
		{/each}
	</ul>
{/if}

{#if data.matches.length}
	<h2 class="section">Matches</h2>
	<ul class="list">
		{#each data.matches as m (m.id)}
			<li class="card row">
				<span class="result" class:won={m.won}>{m.won ? 'Won' : 'Lost'}</span>
				<span class="muted">{when(m.playedAt)}</span>
				<span class="num end">
					<span class="delta {m.delta >= 0 ? 'up' : 'down'}">{sign(m.delta)}</span>
					<span class="muted">→ {m.ratingBefore + m.delta}</span>
				</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">No matches yet.</p>
{/if}

<style>
	.hero {
		padding: 1.1rem 1.1rem 0.6rem;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		text-align: center;
	}

	.stats div {
		display: flex;
		flex-direction: column;
	}

	.stats strong {
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.stats .big {
		font-size: 1.6rem;
		color: var(--accent);
	}

	.stats span {
		font-size: 0.7rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.curve {
		display: block;
		width: 100%;
		height: 5.5rem;
		margin-top: 1rem;
		overflow: visible;
	}

	.curve .line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.curve .area {
		fill: var(--accent);
		opacity: 0.12;
		stroke: none;
	}

	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.68rem;
	}

	.section {
		margin: 1.75rem 0 0.6rem;
		color: var(--muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.85rem;
		font-size: 0.9rem;
	}

	.row .end {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	.result {
		font-weight: 600;
		color: var(--loss);
	}

	.result.won {
		color: var(--win);
	}
</style>
