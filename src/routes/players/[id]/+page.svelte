<script lang="ts">
	import { shell } from '$lib/shell';
	import RatingCurve from '$lib/components/RatingCurve.svelte';
	import { percent, shortDate, signed } from '$lib/core/format';
	import RankBadge from '$lib/components/RankBadge.svelte';
	import { rankProgress } from '$lib/core/rating/ranks';
	import { findModule } from '$lib/modules/registry';

	let { data } = $props();

	const games = $derived(
		shell()
			.gameIds.map((id) => findModule(id))
			.filter((g) => g !== undefined)
	);
	const game = $derived(data.gameId ? findModule(data.gameId) : undefined);
	const standing = $derived(data.standings.find((s) => s.moduleId === data.gameId));
	const ordinal = (n: number) => (n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
</script>

<svelte:head><title>{data.player.name} · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>{data.player.name}</h1>
		<p class="rank-line">
			{#if game}
				<RankBadge
					rating={standing?.rating ?? game.rating.start}
					start={game.rating.start}
					ranked={standing !== undefined}
					size="md"
				/>
				<span>at {game.name.toLowerCase()}</span>
			{/if}{#if !data.player.active}<span>· archived</span>{/if}
		</p>
	</div>
	<a class="btn btn-ghost" href="/players">All people</a>
</header>

{#if games.length > 1}
	<nav class="games" aria-label="Games">
		{#each games as g (g.id)}
			{@const s = data.standings.find((x) => x.moduleId === g.id)}
			<a
				href="?game={g.id}"
				class:active={g.id === data.gameId}
				aria-current={g.id === data.gameId ? 'page' : undefined}
				data-sveltekit-noscroll
				data-sveltekit-replacestate
			>
				{g.name}
				<span class="num">{s?.rating ?? g.rating.start}</span>
			</a>
		{/each}
	</nav>
{/if}

{#if game && data.profile}
	{@const s = standing}
	<div class="card hero">
		<div class="stats">
			<div>
				<strong class="num big">{s?.rating ?? game.rating.start}</strong><span>rating</span>
			</div>
			<div><strong class="num">{s?.wins ?? 0}–{s?.losses ?? 0}</strong><span>W–L</span></div>
			<div>
				<strong class="num">{percent(s?.wins ?? 0, s?.games ?? 0)}</strong><span>win rate</span>
			</div>
			<div><strong class="num">{s?.peak ?? game.rating.start}</strong><span>peak</span></div>
		</div>
		{#if s && s.games > 0}
			{@const climb = rankProgress(s.rating, game.rating.start)}
			<div class="climb">
				<div class="climb-label">
					<RankBadge rating={s.rating} start={game.rating.start} />
					{#if climb.next}
						<span class="muted num">{climb.toGo} to {climb.next.name}</span>
					{:else}
						<span class="muted">Top rank</span>
					{/if}
				</div>
				<div
					class="bar"
					role="progressbar"
					aria-label="Progress to {climb.next?.name ?? 'the top'}"
					aria-valuenow={Math.round(climb.progress * 100)}
					aria-valuemin={0}
					aria-valuemax={100}
					style:--metal="var(--rank-{(climb.next ?? climb.rank).id})"
				>
					<i style:width="{climb.progress * 100}%"></i>
				</div>
			</div>
		{/if}
		<RatingCurve points={data.profile.curve} />
	</div>

	{#if data.profile.stats.length}
		<h2 class="section-label">{game.name} stats</h2>
		<dl class="card extra">
			{#each data.profile.stats as line (line.label)}
				<div>
					<dt>{line.label}</dt>
					<dd class="num">{line.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if data.profile.rivals.length}
		<h2 class="section-label">Head to head</h2>
		<ul class="stack tight">
			{#each data.profile.rivals as rival (rival.id)}
				<li class="card row">
					<a href="/players/{rival.id}?game={game.id}">{rival.name}</a>
					<span class="num end">
						<span class="delta up">{rival.wins}</span> –
						<span class="delta down">{rival.losses}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="section-label">Matches</h2>
	{#if data.profile.matches.length}
		<ul class="stack tight">
			{#each data.profile.matches as m (m.id)}
				<li class="card row">
					<span class="result" class:won={m.won}
						>{m.won ? 'Won' : m.placement > 2 ? ordinal(m.placement) : 'Lost'}</span
					>
					<span class="vs">
						{#if m.opponents.length}<span class="muted">vs</span> {m.opponents.join(', ')}{/if}
						{#if m.summary}<span class="muted num"> · {m.summary}</span>{/if}
					</span>
					<span class="num end">
						<span class="delta {m.delta >= 0 ? 'up' : 'down'}">{signed(m.delta)}</span>
						<span class="muted when">{shortDate(m.playedAt)}</span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No {game.name.toLowerCase()} matches yet.</p>
	{/if}
{/if}

<style>
	.games {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.games a {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
	}

	.games a span {
		color: var(--muted);
		font-weight: 500;
	}

	.games a.active {
		color: var(--accent-on-soft);
		background: var(--accent-soft);
		border-color: transparent;
	}

	.games a.active span {
		color: inherit;
	}

	.rank-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.35rem !important;
	}

	.climb {
		margin-top: 1rem;
	}

	.climb-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.4rem;
		font-size: 0.8rem;
	}

	.bar {
		height: 0.45rem;
		overflow: hidden;
		background: var(--surface-2);
		border-radius: 999px;
	}

	.bar i {
		display: block;
		height: 100%;
		background: var(--metal);
		border-radius: inherit;
	}

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
		color: var(--accent);
		font-size: 1.6rem;
	}

	.stats span,
	dt {
		color: var(--muted);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.extra {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: 0.9rem;
		margin: 0;
	}

	dd {
		margin: 0.1rem 0 0;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.tight {
		gap: 0.4rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.85rem;
		font-size: 0.9rem;
	}

	.row a {
		text-decoration: none;
	}

	.vs {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.end {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
		white-space: nowrap;
	}

	.when {
		min-width: 3.2rem;
		text-align: right;
	}

	.result {
		min-width: 2.6rem;
		color: var(--loss);
		font-weight: 600;
	}

	.result.won {
		color: var(--win);
	}
</style>
