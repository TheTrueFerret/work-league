<!--
	A player's rank (Bronze → Diamond) as a small metal-coloured badge.
	Players with no games yet show as unranked.
-->
<script lang="ts">
	import { rankFor } from '$lib/core/rating/ranks';

	interface Props {
		rating: number;
		/** The game's starting rating; ranks are measured from it. */
		start: number;
		/** Matches played; zero shows "Unranked". */
		games?: number;
		size?: 'sm' | 'md' | 'lg';
	}

	let { rating, start, games = 1, size = 'sm' }: Props = $props();

	const rank = $derived(games > 0 ? rankFor(rating, start) : null);
</script>

<span
	class="badge {size}"
	class:unranked={!rank}
	style:--metal={rank ? `var(--rank-${rank.id})` : undefined}
	style:--metal-soft={rank ? `var(--rank-${rank.id}-soft)` : undefined}
	style:--metal-on-soft={rank ? `var(--rank-${rank.id}-on-soft)` : undefined}
>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if rank?.id === 'diamond'}
			<path d="M6 3h12l4 6-10 12L2 9z" />
			<path class="facet" d="M2 9h20M12 21 8 9l4-6 4 6z" />
		{:else}
			<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
			{#if rank}
				<path
					class="facet"
					d={rank.id === 'bronze'
						? 'M9 12h6'
						: rank.id === 'silver'
							? 'M9 10h6M9 14h6'
							: rank.id === 'gold'
								? 'M9 9h6M9 12h6M9 15h6'
								: 'm8 12 3 3 5-6'}
				/>
			{/if}
		{/if}
	</svg>
	{rank?.name ?? 'Unranked'}
</span>

<style>
	.badge {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.25rem;
		padding: 0.1rem 0.5rem 0.1rem 0.35rem;
		color: var(--metal-on-soft);
		background: var(--metal-soft);
		border: 1px solid color-mix(in oklab, var(--metal) 40%, transparent);
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.badge.md {
		padding: 0.2rem 0.65rem 0.2rem 0.45rem;
		font-size: 0.8rem;
	}

	.badge.lg {
		gap: 0.4rem;
		padding: 0.3rem 0.85rem 0.3rem 0.55rem;
		font-size: 0.95rem;
	}

	.unranked {
		color: var(--muted);
		background: var(--surface-2);
		border-color: var(--border);
	}

	svg {
		width: 1.1em;
		height: 1.1em;
		fill: var(--metal, var(--muted));
		stroke: var(--metal, var(--muted));
		stroke-width: 1.5;
		stroke-linejoin: round;
	}

	.unranked svg {
		fill: none;
	}

	.facet {
		fill: none;
		stroke: var(--metal-soft, var(--surface-2));
		stroke-width: 1.6;
		stroke-linecap: round;
	}
</style>
