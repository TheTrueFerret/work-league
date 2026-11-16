<script lang="ts">
	import { shell } from '$lib/shell';
	import Icon from '$lib/components/Icon.svelte';
	import RankBadge from '$lib/components/RankBadge.svelte';
	import { DEFAULT_START_RATING } from '$lib/core/rating/elo';
	import { plural } from '$lib/core/format';
	import { findModule } from '$lib/modules/registry';

	let { data } = $props();

	const cards = $derived(
		data.games.flatMap((g) => {
			const module = findModule(g.id);
			return module ? [{ ...g, module }] : [];
		})
	);
	const medal = ['🥇', '🥈', '🥉'];
</script>

<svelte:head><title>{shell().branding.name}</title></svelte:head>

<header class="welcome">
	<h1>{shell().branding.name}</h1>
	{#if shell().branding.tagline}<p>{shell().branding.tagline}</p>{/if}
</header>

<section aria-labelledby="games-heading">
	<h2 id="games-heading" class="section-label">Games</h2>
	{#if cards.length}
		<div class="games">
			{#each cards as card (card.id)}
				<a
					class="game"
					href="/{card.id}"
					style:--game="var(--game-{card.id})"
					style:--game-container="var(--game-{card.id}-container)"
					style:--game-on-container="var(--game-{card.id}-on-container)"
				>
					<span class="game-icon" aria-hidden="true"
						><Icon path={card.module.icon} size="1.6rem" /></span
					>
					<span class="game-text">
						<strong>{card.module.name}</strong>
						<span class="muted">{card.module.description}</span>
						<span class="meta">
							<span>{plural(card.matches, 'match', 'matches')}</span>
							{#if card.leader}<span
									>👑 {card.leader.name} · <span class="num">{card.leader.rating}</span></span
								>{/if}
						</span>
					</span>
				</a>
			{/each}
		</div>
	{:else}
		<p class="card empty">No games are switched on. An admin can turn them on in Admin.</p>
	{/if}
</section>

<section aria-labelledby="champ-heading">
	<div class="section-row">
		<h2 id="champ-heading" class="section-label">Office championship</h2>
		<a href="/championship">Full table →</a>
	</div>
	{#if data.podium.length}
		<ol class="podium">
			{#each data.podium as entry, i (entry.playerId)}
				<li class="card">
					<span class="medal" aria-hidden="true">{medal[i]}</span>
					<a href="/players/{entry.playerId}">{entry.name}</a>
					<RankBadge rating={entry.score} start={DEFAULT_START_RATING} />
					<span class="num score">{Math.round(entry.score)}</span>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="card empty">Everyone's on the table. Play any game to start climbing it.</p>
	{/if}
	<p class="muted small">
		{plural(data.people, 'person', 'people')} in the running, across {plural(cards.length, 'game')}.
	</p>
</section>

<style>
	.welcome {
		padding: 2rem 0 0.5rem;
	}

	.welcome h1 {
		font-size: clamp(2.2rem, 9vw, 3.6rem);
		line-height: 1;
		letter-spacing: -0.05em;
	}

	.welcome p {
		margin: 0.75rem 0 0;
		color: var(--muted);
		font-size: 1.05rem;
	}

	.games {
		display: grid;
		gap: 0.7rem;
	}

	@media (min-width: 40rem) {
		.games {
			grid-template-columns: 1fr 1fr;
		}
	}

	.game {
		display: flex;
		gap: 0.9rem;
		align-items: flex-start;
		padding: 1.1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow);
		text-decoration: none;
		transition:
			transform 0.18s,
			border-color 0.18s;
	}

	.game:hover {
		border-color: var(--game);
		transform: translateY(-2px);
	}

	.game-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 3rem;
		height: 3rem;
		color: var(--game-on-container);
		background: var(--game-container);
		border-radius: 1rem;
	}

	.game-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.game-text strong {
		font-size: 1.05rem;
	}

	.game-text .muted {
		font-size: 0.85rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		margin-top: 0.3rem;
		color: var(--game);
		font-size: 0.78rem;
		font-weight: 600;
	}

	.section-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.section-row a {
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
	}

	.podium {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.podium li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
	}

	.podium a {
		font-weight: 600;
		text-decoration: none;
	}

	.medal {
		font-size: 1.2rem;
	}

	.score {
		margin-left: auto;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.small {
		margin-top: 0.6rem;
		font-size: 0.8rem;
	}
</style>
