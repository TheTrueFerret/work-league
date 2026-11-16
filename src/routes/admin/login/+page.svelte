<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Admin sign-in · {shell().branding.name}</title></svelte:head>

<AuthCard title="Admin sign-in">
	{#if !data.configured}
		<p class="muted">
			Admin is switched off because no admin password is set. Set the <code>ADMIN_PASSWORD</code>
			environment variable (on Cloudflare: <code>npx wrangler secret put ADMIN_PASSWORD</code>) and
			restart.
		</p>
	{:else}
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
			<label class="sr-only" for="password">Admin password</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="password"
				type="password"
				name="password"
				autocomplete="current-password"
				required
				autofocus
			/>
			<button class="btn btn-primary" disabled={busy}>Sign in</button>
		</form>
	{/if}
	<a class="back" href="/">Back to the league</a>
</AuthCard>

<style>
	p {
		margin: 0 0 0.6rem;
		font-size: 0.9rem;
	}

	code {
		font-size: 0.85em;
	}

	.back {
		margin-top: 0.8rem;
		color: var(--accent);
		font-size: 0.85rem;
	}
</style>
