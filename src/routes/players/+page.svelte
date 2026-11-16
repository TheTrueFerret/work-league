<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import { plural } from '$lib/core/format';

	let { data, form } = $props();

	let name = $state('');
	/** Player id currently being renamed. */
	let editing = $state<number | null>(null);

	const active = $derived(data.players.filter((p) => p.active));
	const archived = $derived(data.players.filter((p) => !p.active));
	const groups = $derived([
		{ title: null, list: active },
		{ title: 'Archived', list: archived }
	]);
</script>

<svelte:head><title>People · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>People</h1>
		<p>Everyone in the office, across every game.</p>
	</div>
</header>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

{#if shell().member}
	<form
		class="add"
		method="POST"
		action="?/add"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') name = '';
			}}
	>
		<label class="sr-only" for="new-player">Name</label>
		<input
			id="new-player"
			type="text"
			name="name"
			bind:value={name}
			placeholder="Add a person"
			maxlength="40"
			required
		/>
		<button class="btn btn-primary" disabled={!name.trim()}>Add</button>
	</form>
{/if}

{#each groups as group (group.title)}
	{#if group.list.length}
		{#if group.title}<h2 class="section-label">{group.title}</h2>{/if}
		<ul class="stack">
			{#each group.list as p (p.id)}
				<li class="card row">
					{#if editing === p.id}
						<form
							class="rename"
							method="POST"
							action="?/rename"
							use:enhance={() =>
								async ({ update }) => {
									editing = null;
									await update();
								}}
						>
							<input type="hidden" name="id" value={p.id} />
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								name="name"
								value={p.name}
								maxlength="40"
								required
								autofocus
								aria-label="New name"
							/>
							<button class="btn btn-primary">Save</button>
							<button type="button" class="btn btn-ghost" onclick={() => (editing = null)}
								>Cancel</button
							>
						</form>
					{:else}
						<a class="who" href="/players/{p.id}">
							<span class="avatar" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
							<span>
								<span class="name">{p.name}</span>
								<span class="sub num">{plural(p.games, 'match', 'matches')}</span>
							</span>
						</a>

						{#if shell().admin}
							<div class="actions">
								<button type="button" class="btn btn-ghost sm" onclick={() => (editing = p.id)}
									>Rename</button
								>
								<form method="POST" action="?/archive" use:enhance>
									<input type="hidden" name="id" value={p.id} />
									<input type="hidden" name="active" value={p.active ? '0' : '1'} />
									<button class="btn btn-ghost sm">{p.active ? 'Archive' : 'Restore'}</button>
								</form>
								{#if p.games === 0}
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={p.id} />
										<button class="btn btn-ghost sm danger" aria-label="Delete {p.name}"
											>Delete</button
										>
									</form>
								{/if}
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/each}

{#if !data.players.length}
	<p class="empty">Nobody here yet. Add the first person above.</p>
{/if}

<style>
	.add {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.8rem;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		text-decoration: none;
	}

	.who > span:last-child {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.avatar {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		color: var(--secondary-on-soft);
		background: var(--secondary-soft);
		border-radius: 50%;
		font-weight: 700;
	}

	.name {
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub {
		color: var(--muted);
		font-size: 0.78rem;
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
		border-color: transparent;
		color: var(--muted);
		font-size: 0.78rem;
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

	@media (max-width: 30rem) {
		.row {
			flex-wrap: wrap;
		}

		.actions {
			margin-left: 2.9rem;
		}
	}
</style>
