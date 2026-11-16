<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { relativeTime, signed } from '$lib/core/format';
	import { findModule } from '$lib/modules/registry';

	let { data, form } = $props();

	const game = $derived(findModule(page.params.game ?? '')!);
	/** Match id awaiting delete confirmation. */
	let confirming = $state<number | null>(null);

	const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
</script>

<svelte:head><title>{game.name} history · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>History</h1>
		<p>
			{#if shell().admin}Deleting a match replays every rating after it.{:else}The latest {game.name.toLowerCase()} results.{/if}
		</p>
	</div>
</header>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

{#if !data.matches.length}
	<div class="card empty">
		<p>No matches recorded yet.</p>
		{#if shell().member}<a class="btn btn-primary" href="/{game.id}/play">Record one</a>{/if}
	</div>
{:else}
	<ul class="stack">
		{#each data.matches as m (m.id)}
			<li class="card match">
				<header>
					<span class="muted">{relativeTime(m.playedAt)}</span>
					{#if m.summary}<span class="summary num">{m.summary}</span>{/if}
					{#if m.note}<span class="note">{m.note}</span>{/if}
					{#if shell().admin}
						<button
							type="button"
							class="del"
							aria-label="Delete match"
							onclick={() => (confirming = confirming === m.id ? null : m.id)}>×</button
						>
					{/if}
				</header>

				<div class="sides" class:many={m.sides.length > 2}>
					{#each m.sides as side (side.side)}
						<div class="side" class:won={side.placement === 1} style:--side="var(--side-{side.side % 8})">
							{#each side.players as p (p.playerId)}
								<a class="line" href="/players/{p.playerId}?game={game.id}">
									<span class="pname">{p.name}</span>
									<span class="delta {p.delta >= 0 ? 'up' : 'down'}">{signed(p.delta)}</span>
								</a>
							{/each}
							<span class="tag">{side.placement === 1 ? 'won' : m.sides.length > 2 ? ordinal(side.placement) : ''}</span>
						</div>
					{/each}
				</div>

				{#if confirming === m.id}
					<form
						method="POST"
						action="?/delete"
						use:enhance={() =>
							async ({ update }) => {
								confirming = null;
								await update();
							}}
					>
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

	.summary {
		font-weight: 600;
	}

	.note {
		overflow: hidden;
		color: var(--muted);
		font-style: italic;
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

	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.sides.many {
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.55rem 0.65rem;
		background: color-mix(in oklab, var(--side) 8%, transparent);
		border: 1px solid color-mix(in oklab, var(--side) 22%, transparent);
		border-radius: var(--r-sm);
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
		min-height: 1em;
		margin-top: 0.25rem;
		color: var(--side);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	form {
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}

	form p {
		margin: 0 0 0.6rem;
		color: var(--muted);
		font-size: 0.85rem;
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
