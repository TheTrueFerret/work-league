<script lang="ts">
	import { page } from '$app/state';
	import { leagueModules, moduleForPath } from '$lib/modules';
	import './app.css';

	let { children } = $props();
	const activeModule = $derived(moduleForPath(page.url.pathname));
	const tabs = $derived(activeModule?.navigation ?? []);
	const isActive = (href: string) =>
		href === activeModule?.href ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<div class="shell" class:with-tabs={tabs.length > 0}>
	<header class="topbar">
		<a class="brand" href="/" aria-label="Work League home"><span>W</span> Work League</a>
		{#if activeModule}<span class="context">/ {activeModule.name}</span>{/if}
		{#if !activeModule && page.url.pathname === '/'}<span class="count">{leagueModules.length} module</span>{/if}
	</header>
	<main>{@render children()}</main>
	{#if tabs.length}
		<nav aria-label={`${activeModule?.name} navigation`}>
			{#each tabs as tab (tab.href)}
				<a href={tab.href} class:active={isActive(tab.href)} aria-current={isActive(tab.href) ? 'page' : undefined}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} /></svg><span>{tab.label}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.shell { min-height: 100dvh; }
	.topbar { display: flex; align-items: center; gap: .6rem; width: 100%; max-width: 62rem; height: 4rem; margin: 0 auto; padding: 0 1rem; }
	.brand { display: flex; align-items: center; gap: .55rem; font-weight: 800; letter-spacing: -.025em; text-decoration: none; }
	.brand > span { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; color: var(--accent-on-fill); background: var(--accent-fill); border-radius: .55rem; font-size: .85rem; }
	.context, .count { color: var(--muted); font-size: .78rem; }
	.count { margin-left: auto; }
	main { width: 100%; max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	.with-tabs main { padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
	nav { position: fixed; inset: auto 0 0; z-index: 20; display: grid; grid-template-columns: repeat(4, 1fr); gap: .25rem; max-width: 46rem; margin: 0 auto; padding: .4rem .5rem calc(.4rem + env(safe-area-inset-bottom)); background: color-mix(in oklab, var(--surface) 88%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--border); }
	nav a { display: flex; flex-direction: column; align-items: center; gap: .2rem; padding: .5rem .25rem; border-radius: var(--r-md); color: var(--muted); font-size: .7rem; font-weight: 600; text-decoration: none; }
	nav a.active { color: var(--accent); background: var(--accent-soft); }
	nav svg { width: 1.4rem; height: 1.4rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
