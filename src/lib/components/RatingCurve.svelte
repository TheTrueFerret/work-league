<script lang="ts">
	interface Props {
		points: readonly number[];
	}

	let { points }: Props = $props();

	/** The curve as SVG paths, scaled to whatever range this player has seen. */
	const shape = $derived.by(() => {
		if (points.length < 2) return null;
		const lo = Math.min(...points);
		const hi = Math.max(...points);
		const span = Math.max(hi - lo, 40);
		const top = (hi + lo) / 2 + span / 2;
		const x = (i: number) => ((i / (points.length - 1)) * 100).toFixed(2);
		const y = (value: number) => (((top - value) / span) * 100).toFixed(2);
		const line = points.map((value, i) => `${i ? 'L' : 'M'}${x(i)} ${y(value)}`).join(' ');
		return { line, area: `${line} L100 100 L0 100 Z`, lo, hi };
	});
</script>

{#if shape}
	<svg class="curve" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Rating over time, from {shape.lo} to {shape.hi}">
		<path class="area" d={shape.area} />
		<path class="line" d={shape.line} vector-effect="non-scaling-stroke" />
	</svg>
	<div class="axis num muted"><span>{shape.lo}</span><span>{shape.hi}</span></div>
{/if}

<style>
	.curve {
		display: block;
		width: 100%;
		height: 5.5rem;
		margin-top: 1rem;
		overflow: visible;
	}

	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.area {
		fill: var(--accent);
		opacity: 0.12;
	}

	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.68rem;
	}
</style>
