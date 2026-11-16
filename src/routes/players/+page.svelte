<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let name = $state('');
	/** Player id currently being renamed. @type {number | null} */
	let editing = $state(null);

	const active = $derived(data.players.filter((p) => p.active));
	const archived = $derived(data.players.filter((p) => !p.active));
</script>

<svelte:head><title>Players · Work League</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Players</h1>
		<p>Everyone starts at 1000.</p>
	</div>
</header>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<form
	class="add"
	method="POST"
	action="?/add"
	use:enhance={() => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') name = '';
	}}
>
	<input type="text" name="name" bind:value={name} placeholder="Add a player" maxlength="40" required />
	<button class="btn btn-primary" disabled={!name.trim()}>Add</button>
</form>

{#each [{ title: null, list: active }, { title: 'Archived', list: archived }] as group (group.title)}
	{#if group.list.length}
		{#if group.title}<h2 class="section">{group.title}</h2>{/if}
		<ul class="list">
			{#each group.list as p (p.id)}
				<li class="card row">
					{#if editing === p.id}
						<form
							class="rename"
							method="POST"
							action="?/rename"
							use:enhance={() => async ({ update }) => {
								editing = null;
								await update();
							}}
						>
							<input type="hidden" name="id" value={p.id} />
							<!-- svelte-ignore a11y_autofocus -->
							<input type="text" name="name" value={p.name} maxlength="40" required autofocus />
							<button class="btn btn-primary">Save</button>
							<button type="button" class="btn btn-ghost" onclick={() => (editing = null)}>Cancel</button>
						</form>
					{:else}
						<div class="who">
							<a class="name" href="/players/{p.id}">{p.name}</a>
							<span class="sub num">
								{p.rating} · {p.games} {p.games === 1 ? 'match' : 'matches'}
							</span>
						</div>

						<div class="actions">
							<button type="button" class="btn btn-ghost sm" onclick={() => (editing = p.id)}>Rename</button>

							<form method="POST" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="active" value={p.active ? '0' : '1'} />
								<button class="btn btn-ghost sm">{p.active ? 'Archive' : 'Restore'}</button>
							</form>

							{#if p.games === 0}
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={p.id} />
									<button class="btn btn-ghost sm danger" aria-label="Delete {p.name}">Delete</button>
								</form>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/each}

{#if !data.players.length}
	<p class="empty">Nobody here yet — add your first player above.</p>
{/if}

<style>
	.add {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.section {
		margin: 1.75rem 0 0.6rem;
		color: var(--muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.8rem;
	}

	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		font-weight: 600;
		text-decoration: none;
	}

	.sub {
		font-size: 0.78rem;
		color: var(--muted);
	}

	.actions {
		display: flex;
		gap: 0.3rem;
		margin-left: auto;
	}

	.actions form {
		display: contents;
	}

	.sm {
		padding: 0.35rem 0.6rem;
		font-size: 0.78rem;
		border-color: transparent;
		color: var(--muted);
	}

	.sm:hover {
		color: var(--text);
	}

	.sm.danger:hover {
		color: var(--loss);
	}

	.rename {
		display: flex;
		gap: 0.4rem;
		width: 100%;
	}

	.rename .btn {
		padding: 0.5rem 0.8rem;
		font-size: 0.85rem;
	}
</style>
