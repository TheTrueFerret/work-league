<script lang="ts">
	import { shell } from '$lib/shell';
	import { applyAction, deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { findModule } from '$lib/modules/registry';
	import type { MatchSubmission } from '$lib/modules/types';

	let { data } = $props();

	const game = $derived(findModule(page.params.game ?? '')!);
	// Each game's record screen is its own chunk, fetched only when opened.
	const screen = $derived(game.Record());

	let submitting = $state(false);
	let error = $state<string | null>(null);

	/** Resolves true once saved; the page then moves on to the rankings. */
	async function submit(match: MatchSubmission): Promise<boolean> {
		submitting = true;
		error = null;
		try {
			const body = new FormData();
			body.set('match', JSON.stringify(match));
			const response = await fetch(page.url.pathname, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'failure') {
				const data = result.data as { error?: string } | undefined;
				error = data?.error ?? 'That result was not saved';
				return false;
			}
			if (result.type === 'error') {
				error = 'The server could not save that result. Try again.';
				return false;
			}
			// Let the game clear its saved state before the page changes.
			setTimeout(() => void applyAction(result));
			return true;
		} catch {
			error = 'Could not reach the server. Your game is kept on this device, so try again.';
			return false;
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Play {game.name} · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Play {game.name.toLowerCase()}</h1>
	</div>
</header>

{#if !shell().member}
	<div class="card empty">
		<p>Enter the office passphrase to record results.</p>
		<a class="btn btn-primary" href="/unlock?next={encodeURIComponent(page.url.pathname)}">Unlock</a
		>
	</div>
{:else}
	{#await screen}
		<p class="muted">Loading…</p>
	{:then { default: Record }}
		<Record players={data.players} rating={game.rating} {submit} {submitting} {error} />
	{:catch}
		<p class="error">This game's screen failed to load. Check your connection and reload.</p>
	{/await}
{/if}
