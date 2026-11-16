<script>
	import { tier } from '$lib/modules/pool';

	let { data } = $props();

	const ranked = $derived(data.players.filter((p) => p.games > 0));
	const unranked = $derived(data.players.filter((p) => p.games === 0));

	const medal = ['🥇', '🥈', '🥉'];

	/** @param {number} streak */
	function streakLabel(streak) {
		if (streak >= 3) return `${streak} win streak`;
		if (streak <= -3) return `${-streak} loss streak`;
		return null;
	}
</script>

<svelte:head><title>Ranks · Work League</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Rankings</h1>
		<p>{data.stats.matches} {data.stats.matches === 1 ? 'match' : 'matches'} played</p>
	</div>
	<a class="btn btn-primary" href="/pool/new">Record match</a>
</header>

{#if !data.players.length}
	<div class="card empty">
		<p>No players yet.</p>
		<a class="btn" href="/players">Add the first player</a>
	</div>
{:else}
	<ol class="board">
		{#each ranked as p, i (p.id)}
			<li>
				<a class="row" href="/players/{p.id}">
					<span class="rank num" class:top={i < 3}>{medal[i] ?? i + 1}</span>

					<span class="who">
						<span class="name">{p.name}{#if !p.active}<span class="pill">archived</span>{/if}</span>
						<span class="sub">
							<span class="num">{p.wins}W&thinsp;–&thinsp;{p.losses}L</span>
							<span class="dot">·</span>
							<span>{tier(p.rating)}</span>
							{#if streakLabel(p.streak)}
								<span class="dot">·</span>
								<span class:hot={p.streak > 0} class:cold={p.streak < 0}>{streakLabel(p.streak)}</span>
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

	{#if unranked.length}
		<h2 class="section">Not yet rated</h2>
		<ul class="board">
			{#each unranked as p (p.id)}
				<li>
					<a class="row quiet" href="/players/{p.id}">
						<span class="rank">–</span>
						<span class="who"><span class="name">{p.name}</span><span class="sub">No matches yet</span></span>
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

	.section {
		margin: 1.75rem 0 0.6rem;
		color: var(--muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
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
		opacity: 0.7;
	}

	.rank {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--muted);
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
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sub {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--muted);
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
		text-align: right;
		letter-spacing: -0.02em;
	}

	@media (max-width: 21rem) {
		.form {
			display: none;
		}
	}
</style>
