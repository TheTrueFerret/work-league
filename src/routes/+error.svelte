<script lang="ts">
	import { shell } from '$lib/shell';
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · {shell().branding?.name ?? 'Work League'}</title></svelte:head>

<div class="card empty">
	<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	<p>{page.error?.message}</p>
	<a class="btn btn-primary" href="/">Back to the league</a>
</div>

<style>
	h1 {
		margin-bottom: 0.5rem;
	}
</style>
