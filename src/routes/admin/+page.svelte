<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { findModule } from '$lib/modules/registry';
	import { buildPalette, DEFAULT_SEED, isHexColour } from '$lib/theme/palette';
	import { extractColours, loadImage, renderIcons } from '$lib/theme/logo';

	let { data, form } = $props();

	// The form starts from the saved settings; edits are local until saved.
	// svelte-ignore state_referenced_locally
	let name = $state(data.settings.branding.name);
	// svelte-ignore state_referenced_locally
	let tagline = $state(data.settings.branding.tagline);
	// svelte-ignore state_referenced_locally
	let seed = $state(data.settings.branding.seed);

	let logoIcons = $state<Record<string, string> | null>(null);
	let logoColours = $state<string[]>([]);
	let logoError = $state<string | null>(null);
	let logoPreview = $derived(logoIcons?.['logo.png'] ?? null);

	const validSeed = $derived(isHexColour(seed) ? seed : DEFAULT_SEED);
	const preview = $derived(buildPalette(validSeed, []));
	const previewStyle = (tokens: Record<string, string>) =>
		Object.entries(tokens)
			.map(([k, v]) => `${k}:${v}`)
			.join(';');

	let image: HTMLImageElement | null = null;

	async function chooseLogo(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		logoError = null;
		if (!file) return;
		try {
			image = await loadImage(file);
			logoColours = extractColours(image);
			logoIcons = renderIcons(image, buildPalette(validSeed).light['--accent-soft'] ?? '#ffffff');
		} catch (err) {
			logoError = err instanceof Error ? err.message : 'That image could not be read';
		}
	}

	function useColour(colour: string) {
		seed = colour;
		// Re-render the icon backgrounds in the new colour.
		if (image)
			logoIcons = renderIcons(image, buildPalette(colour).light['--accent-soft'] ?? '#ffffff');
	}

	const saved = $derived(form && 'saved' in form ? form.saved : null);
	const refresh =
		() =>
		async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
</script>

<svelte:head><title>Admin · {shell().branding.name}</title></svelte:head>

<header class="page-head">
	<div>
		<h1>Admin</h1>
		<p>Set up this league: branding, games and who can get in.</p>
	</div>
	<form method="POST" action="?/logout"><button class="btn btn-ghost">Sign out</button></form>
</header>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<!-- Branding ------------------------------------------------------------- -->
<section class="card block" aria-labelledby="brand-heading">
	<h2 id="brand-heading">Branding</h2>
	<p class="muted">
		Your name, logo and one colour. The whole app builds its colours from it, light and dark.
	</p>

	<div class="logo-row">
		<div class="logo-box">
			{#if logoPreview}
				<img src={logoPreview} alt="New logo preview" />
			{:else if data.settings.branding.logoVersion}
				<img src="/brand/logo.png?v={data.settings.branding.logoVersion}" alt="Current logo" />
			{:else}
				<span class="muted">No logo</span>
			{/if}
		</div>
		<div class="logo-actions">
			<label class="btn btn-tonal file">
				Choose logo…
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/svg+xml"
					onchange={chooseLogo}
				/>
			</label>
			{#if logoIcons}
				<form
					method="POST"
					action="?/logo"
					use:enhance={() =>
						async ({ update, result }) => {
							await update();
							if (result.type === 'success') {
								logoIcons = null;
								await invalidateAll();
							}
						}}
				>
					{#each Object.entries(logoIcons) as [key, url] (key)}<input
							type="hidden"
							name={key}
							value={url}
						/>{/each}
					<button class="btn btn-primary">Upload logo</button>
				</form>
			{:else if data.settings.branding.logoVersion}
				<form method="POST" action="?/removeLogo" use:enhance={refresh}>
					<button class="btn btn-ghost">Remove logo</button>
				</form>
			{/if}
			<span class="muted small">Square works best. PNG, JPG, WebP or SVG.</span>
		</div>
	</div>
	{#if logoError}<p class="error">{logoError}</p>{/if}
	{#if saved === 'logo'}<p class="notice">
			Logo saved. Installed apps pick up the new icon when they next update.
		</p>{/if}

	<form method="POST" action="?/branding" class="fields" use:enhance={refresh}>
		<label>
			<span>League name</span>
			<input type="text" name="name" bind:value={name} maxlength="40" required />
		</label>
		<label>
			<span>Tagline</span>
			<input type="text" name="tagline" bind:value={tagline} maxlength="80" />
		</label>

		<div class="colour">
			<span class="label">Brand colour</span>
			<div class="colour-row">
				<input type="color" bind:value={seed} aria-label="Brand colour picker" />
				<input
					type="text"
					name="seed"
					bind:value={seed}
					maxlength="7"
					pattern="#[0-9a-fA-F]{'{6}'}"
					aria-label="Brand colour hex"
					class="hex"
				/>
			</div>
			{#if logoColours.length}
				<div class="from-logo">
					<span class="muted small">From your logo:</span>
					{#each logoColours as colour (colour)}
						<button
							type="button"
							class="swatch"
							style:background={colour}
							aria-label="Use {colour}"
							title={colour}
							onclick={() => useColour(colour)}
						></button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="previews" aria-label="Theme preview">
			{#each [{ label: 'Light', tokens: preview.light }, { label: 'Dark', tokens: preview.dark }] as scheme (scheme.label)}
				<div class="preview" style={previewStyle(scheme.tokens)}>
					<span class="p-label">{scheme.label}</span>
					<div class="p-card">
						<strong>{name || 'Work League'}</strong>
						<span>Rankings · 42 matches</span>
						<div class="p-buttons">
							<span class="p-primary">Play</span>
							<span class="p-tonal">History</span>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<button class="btn btn-primary">Save branding</button>
		{#if saved === 'branding'}<p class="notice">Branding saved.</p>{/if}
	</form>
</section>

<!-- Games ---------------------------------------------------------------- -->
<section class="card block" aria-labelledby="games-heading">
	<h2 id="games-heading">Games</h2>
	<p class="muted">
		Switched-off games disappear from the league. Their results stay in the database.
	</p>
	<form method="POST" action="?/games" use:enhance={refresh}>
		<ul class="toggles">
			{#each data.installed as id (id)}
				{@const game = findModule(id)}
				{#if game}
					<li>
						<label>
							<input
								type="checkbox"
								name="enabled"
								value={id}
								checked={!data.settings.disabled.includes(id)}
							/>
							<span
								><strong>{game.name}</strong><span class="muted small">{game.description}</span
								></span
							>
						</label>
					</li>
				{/if}
			{/each}
		</ul>
		<button class="btn btn-primary">Save games</button>
		{#if saved === 'games'}<p class="notice">Games saved.</p>{/if}
	</form>
</section>

<!-- Access --------------------------------------------------------------- -->
<section class="card block" aria-labelledby="access-heading">
	<h2 id="access-heading">Access</h2>
	{#if data.settings.passphraseSet}
		<p class="muted">
			The league is locked with an office passphrase. Changing it signs everyone out.
		</p>
	{:else}
		<p class="warning">
			The league is open: anyone with the link can record results. Set a passphrase to keep it to
			your colleagues.
		</p>
	{/if}

	<form method="POST" action="?/passphrase" class="inline" use:enhance={refresh}>
		<label class="grow">
			<span>{data.settings.passphraseSet ? 'New passphrase' : 'Office passphrase'}</span>
			<input type="text" name="passphrase" minlength="6" required autocomplete="off" />
		</label>
		<button class="btn btn-primary"
			>{data.settings.passphraseSet ? 'Change' : 'Set passphrase'}</button
		>
	</form>
	{#if saved === 'passphrase'}<p class="notice">Passphrase updated.</p>{/if}

	{#if data.settings.passphraseSet}
		<form method="POST" action="?/publicRead" use:enhance={refresh} class="switch-row">
			<input type="hidden" name="publicRead" value={data.settings.publicRead ? '0' : '1'} />
			<span>
				<strong>Public rankings</strong>
				<span class="muted small"
					>{data.settings.publicRead
						? 'Anyone can view, only colleagues can play.'
						: 'Only colleagues can view.'}</span
				>
			</span>
			<button class="btn btn-tonal"
				>{data.settings.publicRead ? 'Make private' : 'Make public'}</button
			>
		</form>
		<form method="POST" action="?/removePassphrase" use:enhance={refresh}>
			<button class="btn btn-danger">Remove passphrase</button>
		</form>
	{/if}
</section>

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 1.25rem;
		border-radius: var(--r-xl);
	}

	.block > p {
		margin: 0;
		font-size: 0.9rem;
	}

	.small {
		font-size: 0.78rem;
	}

	.warning {
		padding: 0.7rem 0.9rem;
		color: var(--loss);
		background: color-mix(in oklab, var(--loss-soft) 60%, transparent);
		border-radius: var(--r-md);
	}

	.logo-row {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.logo-box {
		display: grid;
		flex: none;
		place-items: center;
		width: 5.5rem;
		height: 5.5rem;
		background: var(--surface-2);
		border-radius: var(--r-lg);
		font-size: 0.75rem;
	}

	.logo-box img {
		width: 4.5rem;
		height: 4.5rem;
		object-fit: contain;
	}

	.logo-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.logo-actions .small {
		flex-basis: 100%;
	}

	.file input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	label > span:first-child,
	.label {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.colour-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	input[type='color'] {
		width: 3rem;
		height: 2.75rem;
		padding: 0.2rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		cursor: pointer;
	}

	.hex {
		max-width: 8rem;
		font-family: ui-monospace, monospace;
	}

	.from-logo {
		display: flex;
		gap: 0.45rem;
		align-items: center;
		margin-top: 0.5rem;
	}

	.swatch {
		width: 2rem;
		height: 2rem;
		border: 2px solid var(--surface);
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--border);
		cursor: pointer;
	}

	.previews {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.preview {
		padding: 0.7rem;
		color: var(--text);
		background: var(--bg);
		border-radius: var(--r-lg);
	}

	.p-label {
		color: var(--muted);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.p-card {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-top: 0.4rem;
		padding: 0.7rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		font-size: 0.85rem;
	}

	.p-card span {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.p-buttons {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.35rem;
	}

	.p-buttons span {
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-weight: 700;
	}

	.p-primary {
		color: var(--accent-on-fill) !important;
		background: var(--accent-fill);
	}

	.p-tonal {
		color: var(--accent-on-soft) !important;
		background: var(--accent-soft);
	}

	.toggles {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0 0 0.75rem;
		padding: 0;
		list-style: none;
	}

	.toggles label {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.6rem 0.75rem;
		background: var(--surface-2);
		border-radius: var(--r-md);
		cursor: pointer;
	}

	.toggles label > span {
		display: flex;
		flex-direction: column;
	}

	.toggles input {
		width: 1.2rem;
		height: 1.2rem;
		accent-color: var(--accent);
	}

	.inline {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.grow {
		flex: 1;
	}

	.switch-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		background: var(--surface-2);
		border-radius: var(--r-md);
	}

	.switch-row > span {
		display: flex;
		flex-direction: column;
	}

	.notice {
		margin: 0;
	}

	@media (max-width: 30rem) {
		.previews {
			grid-template-columns: 1fr;
		}

		.inline {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
