<script lang="ts">
	import { icons, type IconName } from './icons';

	interface Props {
		/** A named icon, or raw path data (game modules ship their own). */
		name?: IconName;
		path?: string;
		size?: string;
	}

	let { name, path, size = '1.4rem' }: Props = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" style:width={size} style:height={size}>
	<path d={path ?? (name ? icons[name] : '')} />
</svg>

<style>
	svg {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
