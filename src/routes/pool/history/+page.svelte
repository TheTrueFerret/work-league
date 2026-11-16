<script>
	import { enhance } from '$app/forms';

	let { data } = $props();

	/** Match id awaiting delete confirmation. @type {number | null} */
	let confirming = $state(null);

	/** @param {number} n */
	const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

	/** @param {Date} at */
	const when = (at) => {
		const d = new Date(at);
		const mins = Math.round((Date.now() - d.getTime()) / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d ago`;
		return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	};
</script>

<svelte:head><title>History · Work League</title></svelte:head>

<header class="page-head">
	<div>
		<h1>History</h1>
		<p>Deleting a match replays every rating that followed it.</p>
	</div>
</header>

{#if !data.matches.length}
	<div class="card empty">
		<p>No matches recorded yet.</p>
		<a class="btn btn-primary" href="/pool/new">Record one</a>
	</div>
{:else}
	<ul class="list">
		{#each data.matches as m (m.id)}
			<li class="card match">
				<header>
					<span class="muted">{when(m.playedAt)}</span>
					{#if m.note}<span class="note">{m.note}</span>{/if}
					<button
						type="button"
						class="del"
						aria-label="Delete match"
						onclick={() => (confirming = confirming === m.id ? null : m.id)}>×</button
					>
				</header>

				<div class="grid">
					{#each [{ key: 'A', team: m.teamA }, { key: 'B', team: m.teamB }] as side (side.key)}
						<div class="side side-{side.key}" class:won={m.winner === side.key}>
							{#each side.team as p (p.playerId)}
								<a class="line" href="/players/{p.playerId}">
									<span class="pname">{p.name}</span>
									<span class="delta {p.delta >= 0 ? 'up' : 'down'}">{sign(p.delta)}</span>
								</a>
							{/each}
							{#if m.winner === side.key}<span class="tag">won</span>{/if}
						</div>
					{/each}
				</div>

				{#if confirming === m.id}
					<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => {
						confirming = null;
						await update();
					}}>
						<input type="hidden" name="id" value={m.id} />
						<p>Delete this match and recalculate every rating since?</p>
						<div class="confirm-actions">
							<button type="button" class="btn btn-ghost" onclick={() => (confirming = null)}>Cancel</button>
							<button class="btn btn-danger">Delete</button>
						</div>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.match {
		padding: 0.75rem;
	}

	.match > header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.55rem;
		font-size: 0.78rem;
	}

	.note {
		color: var(--muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.del {
		margin-left: auto;
		padding: 0 0.35rem;
		background: none;
		border: 0;
		color: var(--muted);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
	}

	.del:hover {
		color: var(--loss);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.side {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.55rem 0.65rem;
		background: color-mix(in oklab, var(--side) 8%, transparent);
		border: 1px solid color-mix(in oklab, var(--side) 22%, transparent);
		border-radius: var(--r-sm);
	}

	.side-A {
		--side: var(--team-a);
	}

	.side-B {
		--side: var(--team-b);
	}

	.side.won {
		background: color-mix(in oklab, var(--side) 16%, transparent);
		border-color: color-mix(in oklab, var(--side) 55%, transparent);
	}

	.line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.88rem;
		text-decoration: none;
	}

	.pname {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag {
		margin-top: 0.25rem;
		color: var(--side);
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	form {
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}

	form p {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
	}

	.confirm-actions .btn {
		flex: 1;
		padding: 0.5rem;
		font-size: 0.85rem;
	}
</style>
