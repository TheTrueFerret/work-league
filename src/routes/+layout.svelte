<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import type { IconName } from '$lib/components/icons';
	import { CREDIT } from '$lib/credit';
	import { findModule } from '$lib/modules/registry';
	import './app.css';

	let { data, children } = $props();

	interface Tab {
		href: string;
		label: string;
		icon: IconName;
		/** Only active on an exact match, for tabs whose path prefixes others. */
		exact?: boolean;
	}

	const gameId = $derived(page.params.game);
	const game = $derived(gameId ? findModule(gameId) : undefined);

	const tabs = $derived.by((): Tab[] => {
		if (game) {
			return [
				{ href: `/${game.id}`, label: 'Ranks', icon: 'ranks', exact: true },
				{ href: `/${game.id}/play`, label: 'Play', icon: 'play' },
				{ href: `/${game.id}/history`, label: 'History', icon: 'history' },
				{ href: '/players', label: 'People', icon: 'people' }
			];
		}
		const base: Tab[] = [
			{ href: '/', label: 'Home', icon: 'home', exact: true },
			{ href: '/championship', label: 'Championship', icon: 'trophy' },
			{ href: '/players', label: 'People', icon: 'people' }
		];
		return data.admin ? [...base, { href: '/admin', label: 'Admin', icon: 'settings' }] : base;
	});

	const isActive = (tab: Tab) =>
		tab.exact ? page.url.pathname === tab.href : page.url.pathname.startsWith(tab.href);

	const bare = $derived(page.url.pathname === '/unlock' || page.url.pathname === '/admin/login');
	const initial = $derived(data.branding.name.trim().charAt(0).toUpperCase() || 'W');
</script>

<div class="shell" class:bare style:--game={game ? `var(--game-${game.id})` : undefined}>
	{#if !bare}
		<header class="topbar">
			<a class="brand" href="/" aria-label="{data.branding.name} home">
				{#if data.branding.logoVersion}
					<img src="/brand/logo.png?v={data.branding.logoVersion}" alt="" width="32" height="32" />
				{:else}
					<span class="monogram" aria-hidden="true">{initial}</span>
				{/if}
				<span class="name">{data.branding.name}</span>
			</a>
			{#if game}
				<span class="context"><span aria-hidden="true">/</span> {game.name}</span>
			{/if}
			{#if data.readOnly && data.passphraseSet}
				<a class="unlock" href="/unlock?next={encodeURIComponent(page.url.pathname)}">
					<Icon name="lock" size="0.95rem" /> Unlock
				</a>
			{/if}
		</header>
	{/if}

	<main>
		{@render children()}
		<footer class="credit">
			<a href={CREDIT.repository} rel="noopener">{CREDIT.product}</a>
			<span aria-hidden="true">·</span>
			made by <a href={CREDIT.url} rel="noopener">{CREDIT.author}</a>
		</footer>
	</main>

	{#if !bare}
		<nav
			aria-label={game ? `${game.name} navigation` : 'Main navigation'}
			style:--tabs={tabs.length}
		>
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class:active={isActive(tab)}
					aria-current={isActive(tab) ? 'page' : undefined}
				>
					<Icon name={tab.icon} />
					<span>{tab.label}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.shell {
		min-height: 100dvh;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		max-width: 46rem;
		height: 4rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		font-weight: 800;
		letter-spacing: -0.025em;
		text-decoration: none;
	}

	.brand img {
		width: 2rem;
		height: 2rem;
		border-radius: 0.55rem;
		object-fit: contain;
	}

	.monogram {
		display: grid;
		flex: none;
		place-items: center;
		width: 2rem;
		height: 2rem;
		color: var(--accent-on-fill);
		background: var(--accent-fill);
		border-radius: 0.6rem;
		font-size: 0.95rem;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.context {
		color: var(--muted);
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.unlock {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
		padding: 0.35rem 0.7rem;
		color: var(--accent-on-soft);
		background: var(--accent-soft);
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
	}

	main {
		width: 100%;
		max-width: 46rem;
		margin: 0 auto;
		padding: 0.75rem 1rem 3rem;
	}

	.shell:not(.bare) main {
		padding-bottom: calc(6rem + env(safe-area-inset-bottom));
	}

	.credit {
		margin-top: 3rem;
		color: var(--muted);
		font-size: 0.75rem;
		text-align: center;
	}

	.credit a {
		color: inherit;
		font-weight: 600;
	}

	nav {
		position: fixed;
		inset: auto 0 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(var(--tabs), 1fr);
		gap: 0.25rem;
		max-width: 46rem;
		margin: 0 auto;
		padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom));
		background: color-mix(in oklab, var(--surface) 88%, transparent);
		backdrop-filter: blur(14px);
		border-top: 1px solid var(--border);
	}

	@media (min-width: 46rem) {
		nav {
			bottom: 0.75rem;
			border: 1px solid var(--border);
			border-radius: 1.25rem;
			box-shadow: var(--shadow-raised);
		}
	}

	nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.45rem 0.25rem;
		color: var(--muted);
		border-radius: 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-decoration: none;
	}

	nav a.active {
		color: var(--accent-on-soft);
		background: var(--accent-soft);
	}
</style>
