<script lang="ts">
	import { shell } from '$lib/shell';
	import { findModule } from '$lib/modules/registry';

	let { data } = $props();

	const games = $derived(
		shell()
			.gameIds.map((id) => findModule(id))
			.filter((g) => g !== undefined)
	);
</script>

<svelte:head><title>Championship · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Office championship</h1>
		<p>
			Everyone is in it. Your score is your average rating across every game, and a game you haven't
			played counts at the starting rating.
		</p>
	</div>
</header>

{#if !data.table.length}
	<div class="card empty">
		<p>Nobody is in the league yet.</p>
		<a class="btn btn-primary" href="/players">Add people</a>
	</div>
{:else}
	<div class="card table-wrap">
		<table>
			<thead>
				<tr>
					<th scope="col" class="rank">#</th>
					<th scope="col">Player</th>
					{#each games as g (g.id)}
						<th scope="col" class="num game" style:--game="var(--game-{g.id})">{g.name}</th>
					{/each}
					<th scope="col" class="num">Score</th>
				</tr>
			</thead>
			<tbody>
				{#each data.table as entry, i (entry.playerId)}
					<tr>
						<td class="rank num">{i + 1}</td>
						<th scope="row"><a href="/players/{entry.playerId}">{entry.name}</a></th>
						{#each entry.perGame as g (g.moduleId)}
							<td
								class="num"
								class:unplayed={!g.played}
								title={g.played ? `${g.games} played` : 'Not played yet'}>{g.rating}</td
							>
						{/each}
						<td class="num score">{entry.score.toFixed(1)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="muted legend">
		<span class="unplayed-sample">1000</span> means a game not played yet, counted at the starting rating.
	</p>
{/if}

<style>
	.page-head p {
		max-width: 34rem;
	}

	.table-wrap {
		padding: 0.25rem 0;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.6rem 0.75rem;
		text-align: left;
		white-space: nowrap;
	}

	thead th {
		color: var(--muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	thead th.game {
		color: var(--game);
	}

	tbody tr + tr {
		border-top: 1px solid var(--border);
	}

	tbody th {
		font-weight: 600;
	}

	tbody th a {
		text-decoration: none;
	}

	.num {
		text-align: right;
	}

	.rank {
		width: 2rem;
		color: var(--muted);
		text-align: center;
	}

	.score {
		color: var(--accent);
		font-weight: 800;
	}

	.unplayed,
	.unplayed-sample {
		color: var(--muted);
		opacity: 0.6;
		font-style: italic;
	}

	.legend {
		margin-top: 0.75rem;
		font-size: 0.8rem;
	}
</style>
