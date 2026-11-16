<script lang="ts">
	import { leagueModules } from '$lib/modules';
</script>

<svelte:head>
	<title>Work League</title>
	<meta name="description" content="Friendly office competition, all in one league." />
</svelte:head>

<header class="welcome">
	<span class="eyebrow">Your office. Your games.</span>
	<h1>Pick a league and get playing.</h1>
	<p>Work League keeps every friendly rivalry in one place. Each game is an independent module, so the league can grow with your team.</p>
</header>

<section aria-labelledby="modules-heading">
	<div class="section-head">
		<h2 id="modules-heading">Game modules</h2>
		<span>{leagueModules.length} active</span>
	</div>
	<div class="module-grid">
		{#each leagueModules as module (module.id)}
			<a class="module-card" href={module.href} style:--module-accent={module.accent}>
				<div class="module-icon" aria-hidden="true">8</div>
				<div>
					<h3>{module.name}</h3>
					<p>{module.description}</p>
				</div>
				<span class="open">Open <span aria-hidden="true">→</span></span>
			</a>
		{/each}
	</div>
</section>

<aside class="extensible">
	<strong>Built to expand.</strong>
	<span>Darts, table football or your own game can join as another typed module.</span>
</aside>

<style>
	.welcome { padding: 3.5rem 0 2.75rem; max-width: 39rem; }
	.eyebrow { color: var(--accent); font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
	.welcome h1 { margin-top: .55rem; font-size: clamp(2.4rem, 9vw, 4.25rem); line-height: .98; letter-spacing: -.055em; }
	.welcome p { max-width: 34rem; margin: 1.25rem 0 0; color: var(--muted); font-size: 1.05rem; }
	.section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .8rem; }
	.section-head span { color: var(--muted); font-size: .8rem; }
	.module-grid { display: grid; gap: .8rem; }
	.module-card { --module-accent: var(--accent); display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; padding: 1.2rem; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 1.15rem; text-decoration: none; box-shadow: var(--shadow); transition: transform .18s, border-color .18s; }
	.module-card:hover { transform: translateY(-2px); border-color: var(--module-accent); }
	.module-icon { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; color: #09230f; background: var(--module-accent); border-radius: 1rem; font-size: 1.3rem; font-weight: 850; }
	.module-card h3 { margin-bottom: .25rem; font-size: 1.05rem; }
	.module-card p { margin: 0; color: var(--muted); font-size: .85rem; }
	.open { color: var(--module-accent); font-size: .85rem; font-weight: 700; }
	.extensible { display: flex; gap: .45rem; margin-top: 1.25rem; padding: 1rem 1.1rem; color: var(--muted); background: var(--surface-2); border-radius: var(--r-lg); font-size: .83rem; }
	.extensible strong { color: var(--text); }
	@media (max-width: 32rem) { .welcome { padding-top: 2.4rem; } .module-card { grid-template-columns: auto 1fr; } .open { grid-column: 2; } .extensible { flex-direction: column; } }
</style>
