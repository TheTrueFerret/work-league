<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Unlock · {shell().branding.name}</title></svelte:head>

<AuthCard title="Enter the office passphrase">
	<p class="muted">Ask a colleague for it. You only need to enter it once on this device.</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<label class="sr-only" for="passphrase">Passphrase</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="passphrase"
			type="password"
			name="passphrase"
			autocomplete="current-password"
			required
			autofocus
		/>
		<button class="btn btn-primary" disabled={busy}>Unlock</button>
	</form>
	{#if data.publicRead}
		<a class="look" href="/">Just looking? View the rankings</a>
	{/if}
</AuthCard>

<style>
	p {
		margin: 0 0 0.6rem;
		font-size: 0.9rem;
	}

	.look {
		margin-top: 0.8rem;
		color: var(--accent);
		font-size: 0.85rem;
	}
</style>
