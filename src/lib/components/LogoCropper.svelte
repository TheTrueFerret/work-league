<script lang="ts">
	import { fitCrop, imageSize, MASKABLE_SAFE_ZONE, type Crop } from '$lib/theme/logo';

	interface Props {
		image: HTMLImageElement;
		/** Where the crop starts: the last one used for this image, or the whole image. */
		crop: Crop;
		/** Background of icons the OS crops, so the phone preview matches what gets saved. */
		iconBackground: string;
		onapply: (crop: Crop) => void;
		oncancel: () => void;
	}

	let { image, crop: initial, iconBackground, onapply, oncancel }: Props = $props();

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 8;
	/** The crop square sits this far in from the stage's edges, so you see what you're cutting off. */
	const INSET = 0.1;

	const size = $derived(imageSize(image));
	const fit = $derived(fitCrop(image));

	// svelte-ignore state_referenced_locally
	let crop = $state<Crop>({ ...initial });
	let stageSize = $state(0);
	let dialog: HTMLDialogElement;
	let frame: HTMLDivElement;

	const zoom = $derived(fit.size / crop.size);
	const windowSize = $derived(stageSize * (1 - 2 * INSET));

	$effect(() => {
		dialog.showModal();
		// Focus the dialog, not the crop area, so it doesn't open with a focus ring around the image.
		dialog.focus();
		return () => dialog.close();
	});

	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

	/** Keeps the zoom in range and the crop's centre on the image, so it can't be lost off-screen. */
	function settle(next: Crop): Crop {
		return {
			size: clamp(next.size, fit.size / MAX_ZOOM, fit.size / MIN_ZOOM),
			x: clamp(next.x, 0, size.width),
			y: clamp(next.y, 0, size.height)
		};
	}

	/** Zooms keeping the image point under `anchor` (pixels from the crop square's corner) still. */
	function zoomTo(nextZoom: number, anchor = { x: windowSize / 2, y: windowSize / 2 }) {
		if (!windowSize) return;
		const nextSize = clamp(fit.size / nextZoom, fit.size / MAX_ZOOM, fit.size / MIN_ZOOM);
		const before = crop.size / windowSize;
		const after = nextSize / windowSize;
		const px = crop.x - crop.size / 2 + anchor.x * before;
		const py = crop.y - crop.size / 2 + anchor.y * before;
		crop = settle({
			size: nextSize,
			x: px - anchor.x * after + nextSize / 2,
			y: py - anchor.y * after + nextSize / 2
		});
	}

	/** Moves the image by screen pixels, the way a finger drags it. */
	function panBy(dx: number, dy: number) {
		if (!windowSize) return;
		const perPixel = crop.size / windowSize;
		crop = settle({ ...crop, x: crop.x - dx * perPixel, y: crop.y - dy * perPixel });
	}

	function fromFrame(clientX: number, clientY: number) {
		const box = frame.getBoundingClientRect();
		return { x: clientX - box.left, y: clientY - box.top };
	}

	// --- Pointer: one finger or the mouse drags, two fingers pinch. -------------

	// Only read inside the handlers, never rendered, so it doesn't need to be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let dragging = $state(false);

	function pointerDown(event: PointerEvent) {
		try {
			// Keep getting moves when the finger leaves the stage.
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			// Capture is a nicety; dragging works without it.
		}
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		dragging = true;
	}

	function pointerMove(event: PointerEvent) {
		const last = pointers.get(event.pointerId);
		if (!last) return;
		const now = { x: event.clientX, y: event.clientY };
		if (pointers.size === 1) {
			panBy(now.x - last.x, now.y - last.y);
		} else if (pointers.size === 2) {
			const [other] = [...pointers].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
			if (other) {
				const before = Math.hypot(last.x - other.x, last.y - other.y);
				const after = Math.hypot(now.x - other.x, now.y - other.y);
				const mid = fromFrame((now.x + other.x) / 2, (now.y + other.y) / 2);
				if (before > 0) zoomTo(zoom * (after / before), mid);
				panBy((now.x - last.x) / 2, (now.y - last.y) / 2);
			}
		}
		pointers.set(event.pointerId, now);
	}

	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		dragging = pointers.size > 0;
	}

	// Wheel listeners have to be non-passive to stop the page scrolling.
	function wheelZoom(node: HTMLElement) {
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			zoomTo(zoom * Math.exp(-event.deltaY * 0.0015), fromFrame(event.clientX, event.clientY));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	}

	function keyDown(event: KeyboardEvent) {
		const step = event.shiftKey ? 40 : 8;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const move = moves[event.key];
		if (move) panBy(...move);
		else if (event.key === '+' || event.key === '=') zoomTo(zoom * 1.1);
		else if (event.key === '-') zoomTo(zoom / 1.1);
		else if (event.key === '0') crop = fit;
		else return;
		event.preventDefault();
	}

	/** Absolute position of the image, so the crop square lands in a `box`-pixel square at (`offset`, `offset`). */
	function placement(box: number, offset = 0) {
		const k = box / crop.size;
		return [
			`left:${offset + (crop.size / 2 - crop.x) * k}px`,
			`top:${offset + (crop.size / 2 - crop.y) * k}px`,
			`width:${size.width * k}px`,
			`height:${size.height * k}px`
		].join(';');
	}
</script>

{#snippet cropped(box: number)}
	<span class="mini" style:width="{box}px" style:height="{box}px">
		<img src={image.src} alt="" style={placement(box)} />
	</span>
{/snippet}

<dialog
	bind:this={dialog}
	class="cropper"
	tabindex="-1"
	aria-labelledby="crop-title"
	oncancel={(event) => {
		event.preventDefault();
		oncancel();
	}}
>
	<h2 id="crop-title">Position your logo</h2>
	<p class="muted hint">Drag to move it. Zoom with the slider, scroll wheel or two fingers.</p>

	<!-- A focusable drag-and-zoom area: there is no native element for this. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="stage"
		class:dragging
		bind:clientWidth={stageSize}
		role="application"
		aria-label="Logo crop. Arrow keys move the logo, plus and minus zoom, 0 fits it."
		tabindex="0"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onkeydown={keyDown}
		{@attach wheelZoom}
	>
		<div class="checker" style:inset="{INSET * 100}%"></div>
		{#if stageSize}
			<img
				src={image.src}
				alt=""
				draggable="false"
				style={placement(windowSize, stageSize * INSET)}
			/>
		{/if}
		<div class="frame" bind:this={frame} style:inset="{INSET * 100}%">
			<span class="guide h"></span><span class="guide v"></span>
		</div>
	</div>

	<div class="zoom">
		<button
			type="button"
			class="btn btn-ghost round"
			aria-label="Zoom out"
			onclick={() => zoomTo(zoom / 1.25)}>−</button
		>
		<input
			type="range"
			aria-label="Zoom"
			min={Math.log(MIN_ZOOM)}
			max={Math.log(MAX_ZOOM)}
			step="0.01"
			value={Math.log(zoom)}
			aria-valuetext="{Math.round(zoom * 100)}%"
			oninput={(event) => zoomTo(Math.exp(Number(event.currentTarget.value)))}
		/>
		<button
			type="button"
			class="btn btn-ghost round"
			aria-label="Zoom in"
			onclick={() => zoomTo(zoom * 1.25)}>+</button
		>
	</div>

	<div class="row">
		<div class="presets">
			<button type="button" class="btn btn-tonal small" onclick={() => (crop = fit)}>Fit</button>
			<button
				type="button"
				class="btn btn-tonal small"
				onclick={() =>
					(crop = {
						...fit,
						size: Math.max(fit.size / MAX_ZOOM, Math.min(size.width, size.height))
					})}>Fill</button
			>
		</div>
		<div class="previews" aria-label="Preview">
			<figure>
				<span class="tile header">{@render cropped(40)}</span>
				<figcaption>App</figcaption>
			</figure>
			<figure>
				<span class="tile phone" style:background={iconBackground}
					>{@render cropped(Math.round(56 * MASKABLE_SAFE_ZONE))}</span
				>
				<figcaption>Phone</figcaption>
			</figure>
		</div>
	</div>

	<div class="actions">
		<button type="button" class="btn btn-ghost" onclick={oncancel}>Cancel</button>
		<button type="button" class="btn btn-primary" onclick={() => onapply(crop)}>Use this</button>
	</div>
</dialog>

<style>
	.cropper {
		width: min(100% - 2rem, 26rem);
		max-height: calc(100% - 2rem);
		padding: 1.2rem;
		overflow-y: auto;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-raised);
	}

	.cropper:focus {
		outline: none;
	}

	.cropper::backdrop {
		background: color-mix(in oklab, var(--bg) 55%, transparent);
		backdrop-filter: blur(3px);
	}

	.cropper[open] {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.hint {
		margin: -0.5rem 0 0;
		font-size: 0.85rem;
	}

	.stage {
		position: relative;
		flex: none;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--surface-3);
		border-radius: var(--r-lg);
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.stage.dragging {
		cursor: grabbing;
	}

	.stage img {
		position: absolute;
		max-width: none;
		pointer-events: none;
	}

	/* Transparent parts of the logo show as a checkerboard. */
	.checker {
		position: absolute;
		--sq: color-mix(in oklab, var(--text) 8%, var(--surface));
		background: repeating-conic-gradient(var(--sq) 0 25%, var(--surface) 0 50%) 0 0 / 1rem 1rem;
	}

	/* Dims everything outside the crop square. */
	.frame {
		position: absolute;
		border: 2px solid var(--accent);
		border-radius: 2px;
		box-shadow: 0 0 0 100vmax color-mix(in oklab, var(--surface-3) 72%, transparent);
		pointer-events: none;
	}

	.guide {
		position: absolute;
		opacity: 0.45;
		border: 0 dashed var(--accent);
	}

	.guide.h {
		top: 50%;
		right: 0;
		left: 0;
		border-top-width: 1px;
	}

	.guide.v {
		top: 0;
		bottom: 0;
		left: 50%;
		border-left-width: 1px;
	}

	.zoom {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.zoom input {
		flex: 1;
		accent-color: var(--accent);
	}

	.round {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border-radius: 50%;
		font-size: 1.25rem;
	}

	.row {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
	}

	.presets {
		display: flex;
		gap: 0.4rem;
	}

	.small {
		padding: 0.45rem 0.9rem;
		font-size: 0.85rem;
	}

	.previews {
		display: flex;
		gap: 0.9rem;
	}

	figure {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: center;
		margin: 0;
	}

	figcaption {
		color: var(--muted);
		font-size: 0.7rem;
		font-weight: 600;
	}

	.tile {
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.header {
		border-radius: 0.7rem;
	}

	.phone {
		width: 56px;
		height: 56px;
		border-radius: 50%;
	}

	.mini {
		position: relative;
		display: block;
		overflow: hidden;
	}

	.mini img {
		position: absolute;
		max-width: none;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
