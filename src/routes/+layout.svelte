<script>
	import { page } from '$app/state';
	import './app.css';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Ranks', icon: 'M4 20V10m6 10V4m6 16v-7' },
		{ href: '/new', label: 'Play', icon: 'M12 5v14M5 12h14' },
		{ href: '/history', label: 'History', icon: 'M12 8v4l3 2M3 12a9 9 0 1 0 2-5.6M3 4v3h3' },
		{ href: '/players', label: 'Players', icon: 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7' }
	];

	/** @param {string} href */
	const isActive = (href) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="shell">
	<main>{@render children()}</main>

	<nav aria-label="Main">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class:active={isActive(tab.href)}
				aria-current={isActive(tab.href) ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} /></svg>
				<span>{tab.label}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 46rem;
		margin: 0 auto;
		padding: 1.25rem 1rem calc(6rem + env(safe-area-inset-bottom));
	}

	nav {
		position: fixed;
		inset: auto 0 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.25rem;
		max-width: 46rem;
		margin: 0 auto;
		padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom));
		background: color-mix(in oklab, var(--surface) 88%, transparent);
		backdrop-filter: blur(14px);
		border-top: 1px solid var(--border);
	}

	nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.5rem 0.25rem;
		border-radius: var(--r-md);
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--muted);
		text-decoration: none;
		transition:
			color 0.15s,
			background 0.15s;
	}

	nav a:hover {
		color: var(--text);
	}

	nav a.active {
		color: var(--accent);
		background: var(--accent-soft);
	}

	nav svg {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
