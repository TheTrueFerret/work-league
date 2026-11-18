<script lang="ts">
	import { shell } from '$lib/shell';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { findModule } from '$lib/modules/registry';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { buildPalette, DEFAULT_SEED, isHexColour } from '$lib/theme/palette';
	import { extractColours, fitCrop, loadImage, renderIcons, type Crop } from '$lib/theme/logo';
	import LogoCropper from '$lib/components/LogoCropper.svelte';
	import { renderShareCard, shareCardKey, shareCardLogoUrl } from '$lib/theme/share-card';

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
	const iconBackground = $derived(buildPalette(validSeed).light['--accent-soft'] ?? '#ffffff');
	const previewStyle = (tokens: Record<string, string>) =>
		Object.entries(tokens)
			.map(([k, v]) => `${k}:${v}`)
			.join(';');

	/** A just-picked file, open in the cropper. Cropping happens once, right after picking. */
	let candidate: HTMLImageElement | null = $state.raw(null);
	/** The cropped logo waiting for "Upload logo". */
	let image: HTMLImageElement | null = $state.raw(null);
	let crop: Crop | null = $state.raw(null);

	async function chooseLogo(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Let the same file be picked again after cancelling.
		input.value = '';
		logoError = null;
		if (!file) return;
		try {
			candidate = await loadImage(file);
		} catch (err) {
			logoError = err instanceof Error ? err.message : 'That image could not be read';
		}
	}

	function applyCrop(next: Crop) {
		if (!candidate) return;
		image = candidate;
		crop = next;
		candidate = null;
		logoColours = extractColours(image, next);
		logoIcons = renderIcons(image, iconBackground, next);
	}

	function discardLogo() {
		image = crop = logoIcons = null;
		logoColours = [];
	}

	function useColour(colour: string) {
		seed = colour;
		// Re-render the icon backgrounds in the new colour.
		if (image && crop) logoIcons = renderIcons(image, iconBackground, crop);
	}

	/**
	 * The link-preview card is drawn here, in the browser, from the saved
	 * branding. Whenever what it would show differs from the stored card, it
	 * is redrawn and sent, so saving the name, colour or logo is enough.
	 */
	let shareCardTried = '';

	async function refreshShareCard(branding: typeof data.settings.branding, key: string) {
		try {
			const [logo, mark] = await Promise.all([
				loadImage(shareCardLogoUrl(branding.logoVersion)),
				loadImage('/icons/icon-192.png')
			]);
			const card = await renderShareCard({
				name: branding.name,
				tagline: branding.tagline,
				seed: branding.seed,
				logo,
				customLogo: Boolean(branding.logoVersion),
				mark
			});
			const body = new FormData();
			body.set('card', card, 'share-card.jpg');
			body.set('key', key);
			const response = await fetch('/admin/share-card', { method: 'POST', body });
			if (!response.ok) throw new Error(`Saving the share card failed (${response.status})`);
			await invalidateAll();
		} catch (err) {
			// Chat apps keep showing the previous card; the next visit tries again.
			console.error(err);
		}
	}

	$effect(() => {
		const branding = data.settings.branding;
		const key = shareCardKey(branding);
		// Try each version of the branding once, so a failure can't loop.
		if (branding.shareCard?.key === key || shareCardTried === key) return;
		shareCardTried = key;
		void refreshShareCard(branding, key);
	});

	const saved = $derived(form && 'saved' in form ? form.saved : null);
	const refresh =
		() =>
		async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};

	// Keep what was typed on screen after saving; SvelteKit would otherwise reset the form,
	// and these inputs have no default value to reset to, so they'd go blank.
	const saveBranding: SubmitFunction =
		() =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				await invalidateAll();
				// Show what the server stored (trimmed, lower-case colour).
				({ name, tagline, seed } = data.settings.branding);
			}
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
			{#if logoIcons}
				<form
					method="POST"
					action="?/logo"
					use:enhance={() =>
						async ({ update, result }) => {
							await update();
							if (result.type === 'success') {
								discardLogo();
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
				<label class="btn btn-ghost file">
					Other image…
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml"
						onchange={chooseLogo}
					/>
				</label>
				<button type="button" class="btn btn-ghost" onclick={discardLogo}>Discard</button>
			{:else}
				<label class="btn btn-tonal file">
					Choose logo…
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml"
						onchange={chooseLogo}
					/>
				</label>
				{#if data.settings.branding.logoVersion}
					<form method="POST" action="?/removeLogo" use:enhance={refresh}>
						<button class="btn btn-ghost">Remove logo</button>
					</form>
				{/if}
			{/if}
			<span class="muted small">PNG, JPG, WebP or SVG. You can crop it before it's saved.</span>
		</div>
	</div>
	{#if logoError}<p class="error">{logoError}</p>{/if}
	{#if candidate}
		<LogoCropper
			image={candidate}
			crop={fitCrop(candidate)}
			{iconBackground}
			onapply={applyCrop}
			oncancel={() => (candidate = null)}
		/>
	{/if}
	{#if saved === 'logo'}<p class="notice">
			Logo saved. Installed apps pick up the new icon when they next update.
		</p>{/if}

	<form method="POST" action="?/branding" class="fields" use:enhance={saveBranding}>
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

<!-- Data --------------------------------------------------------------- -->
<section class="card block" aria-labelledby="data-heading">
	<h2 id="data-heading">Data</h2>
	<p class="muted">
		Download every person and match as JSON, for backups or moving to another server.
	</p>
	<a class="btn btn-tonal" href="/admin/export" download data-sveltekit-reload>Download export</a>
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
		align-items: flex-start;
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

	.block > .btn {
		align-self: flex-start;
	}

	@media (max-width: 30rem) {
		.logo-actions .btn {
			padding: 0.55rem 0.9rem;
			font-size: 0.9rem;
		}

		.previews {
			grid-template-columns: 1fr;
		}

		.inline {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
