<script lang="ts">
	import { shell } from '$lib/shell';
	import { page } from '$app/state';
	import { plural } from '$lib/core/format';
	import RankBadge from '$lib/components/RankBadge.svelte';
	import { findModule } from '$lib/modules/registry';

	let { data } = $props();

	const game = $derived(findModule(page.params.game ?? '')!);
	const ranked = $derived(data.players.filter((p) => p.games > 0));
	const unranked = $derived(data.players.filter((p) => p.games === 0));
	const justRecorded = $derived(page.url.searchParams.has('recorded'));

	const medal = ['🥇', '🥈', '🥉'];

	function streakLabel(streak: number): string | null {
		if (streak >= 3) return `${streak} win streak`;
		if (streak <= -3) return `${-streak} loss streak`;
		return null;
	}
</script>

<svelte:head><title>{game.name} rankings · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>{game.name}</h1>
		<p>{plural(data.matches, 'match', 'matches')} played</p>
	</div>
	{#if shell().member}
		<a class="btn btn-primary" href="/{game.id}/play">Play</a>
	{/if}
</header>

{#if justRecorded}<p class="notice" role="status">Result saved. Ratings updated.</p>{/if}

{#if !data.players.length}
	<div class="card empty">
		<p>No players yet.</p>
		<a class="btn" href="/players">Add the first player</a>
	</div>
{:else}
	{#if ranked.length}
		<ol class="board">
			{#each ranked as p, i (p.id)}
				<li>
					<a class="row" href="/players/{p.id}?game={game.id}">
						<span class="rank num" class:top={i < 3}>{medal[i] ?? i + 1}</span>
						<span class="who">
							<span class="name"
								>{p.name}
								<RankBadge rating={p.rating} start={game.rating.start} />{#if !p.active}<span
										class="pill">archived</span
									>{/if}</span
							>
							<span class="sub">
								<span class="num">{p.wins}W&thinsp;–&thinsp;{p.losses}L</span>
								{#if streakLabel(p.streak)}
									<span class="dot">·</span>
									<span class:hot={p.streak > 0} class:cold={p.streak < 0}
										>{streakLabel(p.streak)}</span
									>
								{/if}
							</span>
						</span>
						<span class="form" aria-label="Recent form: {p.form}">
							{#each p.form.split('') as r, j (j)}
								<i class={r === 'W' ? 'w' : 'l'}></i>
							{/each}
						</span>
						<span class="rating num">{p.rating}</span>
					</a>
				</li>
			{/each}
		</ol>
	{:else}
		<div class="card empty">
			<p>No {game.name.toLowerCase()} matches yet.</p>
			{#if shell().member}<a class="btn btn-primary" href="/{game.id}/play">Play the first one</a
				>{/if}
		</div>
	{/if}

	{#if unranked.length}
		<h2 class="section-label">Not yet rated</h2>
		<ul class="board">
			{#each unranked as p (p.id)}
				<li>
					<a class="row quiet" href="/players/{p.id}?game={game.id}">
						<span class="rank">–</span>
						<span class="who"
							><span class="name">{p.name}</span><span class="sub">No matches yet</span></span
						>
						<span class="rating num muted">{p.rating}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: 2rem 1fr auto auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		text-decoration: none;
		transition: border-color 0.15s;
	}

	.row:hover {
		border-color: color-mix(in oklab, var(--accent) 45%, var(--border));
	}

	.row.quiet {
		grid-template-columns: 2rem 1fr auto;
		opacity: 0.75;
	}

	.rank {
		color: var(--muted);
		font-size: 0.95rem;
		font-weight: 700;
		text-align: center;
	}

	.rank.top {
		font-size: 1.15rem;
	}

	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		color: var(--muted);
		font-size: 0.78rem;
	}

	.dot {
		opacity: 0.5;
	}

	.hot {
		color: var(--win);
	}

	.cold {
		color: var(--loss);
	}

	.form {
		display: flex;
		gap: 2px;
	}

	.form i {
		width: 5px;
		height: 16px;
		border-radius: 2px;
	}

	.form i.w {
		background: var(--win);
	}

	.form i.l {
		background: color-mix(in oklab, var(--loss) 55%, transparent);
	}

	.rating {
		min-width: 3.2rem;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		text-align: right;
	}

	@media (max-width: 22rem) {
		.form {
			display: none;
		}
	}
</style>
