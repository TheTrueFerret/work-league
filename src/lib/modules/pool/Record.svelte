<script lang="ts">
	import SidePicker from '$lib/components/SidePicker.svelte';
	import type { RecordProps } from '../types';

	let { players, rating, submit, submitting, error }: RecordProps = $props();

	let sides = $state<number[][]>([[], []]);
	let note = $state('');
	let showNote = $state(false);

	const ready = $derived(sides.length === 2 && sides.every((side) => side.length > 0));

	function finish(winner: 0 | 1) {
		void submit({ sides, details: { winner }, note });
	}
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if players.length < 2}
	<div class="card empty">
		<p>You need at least two players before you can record a match.</p>
		<a class="btn btn-primary" href="/players">Add players</a>
	</div>
{:else}
	<p class="hint muted">Tap to add a player, tap again to switch teams.</p>
	<SidePicker {players} {rating} bind:sides />

	<div class="finish-area">
		{#if showNote}
			<input
				type="text"
				bind:value={note}
				placeholder="Note (optional), e.g. best of 3"
				maxlength="120"
			/>
		{:else if ready}
			<button type="button" class="btn btn-ghost add-note" onclick={() => (showNote = true)}
				>+ Add a note</button
			>
		{/if}

		<div class="finish">
			<button
				class="btn win"
				style:--side="var(--side-0)"
				style:--on-side="var(--on-side-0)"
				disabled={!ready || submitting}
				onclick={() => finish(0)}
			>
				Team A won
			</button>
			<button
				class="btn win"
				style:--side="var(--side-1)"
				style:--on-side="var(--on-side-1)"
				disabled={!ready || submitting}
				onclick={() => finish(1)}
			>
				Team B won
			</button>
		</div>
	</div>
{/if}

<style>
	.hint {
		margin: -0.4rem 0 0.8rem;
		font-size: 0.85rem;
	}

	.finish-area {
		margin-top: 1.5rem;
	}

	.add-note {
		padding: 0.4rem 0;
		border: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.finish {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}

	.win {
		padding: 1rem 0.5rem;
		background: var(--side);
		border-color: var(--side);
		color: var(--on-side);
		font-size: 1rem;
	}

	.win:hover:not(:disabled) {
		background: var(--side);
		filter: brightness(1.08);
	}
</style>
