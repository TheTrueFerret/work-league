<script lang="ts">
	import { shell } from '$lib/shell';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children: Snippet;
	}

	let { title, children }: Props = $props();

	const branding = $derived(shell().branding);
	const initial = $derived(branding.name.trim().charAt(0).toUpperCase() || 'W');
</script>

<div class="wrap">
	<div class="card auth">
		{#if branding.logoVersion}
			<img src="/brand/logo.png?v={branding.logoVersion}" alt="" width="64" height="64" />
		{:else}
			<span class="monogram" aria-hidden="true">{initial}</span>
		{/if}
		<p class="league">{branding.name}</p>
		<h1>{title}</h1>
		{@render children()}
	</div>
</div>

<style>
	.wrap {
		display: grid;
		min-height: calc(100dvh - 9rem);
		place-items: center;
	}

	.auth {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		max-width: 24rem;
		padding: 2rem 1.5rem;
		border-radius: var(--r-xl);
		text-align: center;
	}

	img,
	.monogram {
		width: 4rem;
		height: 4rem;
		margin-bottom: 0.5rem;
		border-radius: 1.2rem;
		object-fit: contain;
	}

	.monogram {
		display: grid;
		place-items: center;
		color: var(--accent-on-fill);
		background: var(--accent-fill);
		font-size: 1.8rem;
		font-weight: 800;
	}

	.league {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
		font-weight: 600;
	}

	h1 {
		margin-bottom: 0.8rem;
		font-size: 1.4rem;
	}

	.auth :global(form) {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
	}

	.auth :global(.error) {
		width: 100%;
		margin: 0;
		text-align: left;
	}
</style>
