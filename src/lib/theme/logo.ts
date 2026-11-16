import { hexFromArgb, QuantizerCelebi, Score } from '@material/material-color-utilities';

/**
 * Browser-only helpers for the admin logo upload. Resizing happens here, in a
 * canvas, so the server never needs an image library (which would not run
 * on Cloudflare Workers anyway).
 */

export function loadImage(source: File | string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = typeof source === 'string' ? source : URL.createObjectURL(source);
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('That file is not an image this browser can read'));
		image.src = url;
	});
}

/** The image's size in pixels. SVGs without a width or height report 0, so they get a stand-in. */
export function imageSize(image: HTMLImageElement): { width: number; height: number } {
	const width = image.naturalWidth || image.width;
	const height = image.naturalHeight || image.height;
	return width && height ? { width, height } : { width: 512, height: 512 };
}

/**
 * The square of the image that becomes the logo, in the image's own pixels.
 * It may reach past the image's edges: that part stays transparent.
 */
export interface Crop {
	/** Centre of the square. */
	readonly x: number;
	readonly y: number;
	/** Side length. */
	readonly size: number;
}

/** The whole image, centred: what you get without cropping. */
export function fitCrop(image: HTMLImageElement): Crop {
	const { width, height } = imageSize(image);
	return { x: width / 2, y: height / 2, size: Math.max(width, height) };
}

/** Draws the cropped square of `image` into a `box`-pixel square at (`left`, `top`). */
function drawCropped(
	ctx: CanvasRenderingContext2D,
	image: HTMLImageElement,
	crop: Crop,
	left: number,
	top: number,
	box: number
) {
	const { width, height } = imageSize(image);
	const k = box / crop.size;
	ctx.drawImage(
		image,
		left + (crop.size / 2 - crop.x) * k,
		top + (crop.size / 2 - crop.y) * k,
		width * k,
		height * k
	);
}

interface IconSpec {
	readonly size: number;
	/** How much of the square the logo fills. */
	readonly scale: number;
	/** Solid background, for icons the OS crops (maskable, Apple). */
	readonly background?: string;
}

function render(image: HTMLImageElement, crop: Crop, spec: IconSpec): string {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = spec.size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser cannot draw images');
	if (spec.background) {
		ctx.fillStyle = spec.background;
		ctx.fillRect(0, 0, spec.size, spec.size);
	}
	const box = spec.size * spec.scale;
	const margin = (spec.size - box) / 2;
	// Anything outside the logo's square is clipped, so a crop can't spill into the margin.
	ctx.beginPath();
	ctx.rect(margin, margin, box, box);
	ctx.clip();
	ctx.imageSmoothingQuality = 'high';
	drawCropped(ctx, image, crop, margin, margin, box);
	return canvas.toDataURL('image/png');
}

/** Every icon the app needs, as PNG data URLs keyed by their published file name. */
export function renderIcons(
	image: HTMLImageElement,
	background: string,
	crop: Crop = fitCrop(image)
): Record<string, string> {
	return {
		'logo.png': render(image, crop, { size: 256, scale: 1 }),
		'icon-192.png': render(image, crop, { size: 192, scale: 1 }),
		'icon-512.png': render(image, crop, { size: 512, scale: 1 }),
		// Android crops maskable icons to a circle; keep the logo inside the safe zone.
		'icon-maskable-512.png': render(image, crop, {
			size: 512,
			scale: MASKABLE_SAFE_ZONE,
			background
		}),
		'apple-touch-icon.png': render(image, crop, { size: 180, scale: 0.78, background })
	};
}

/** How much of a maskable icon the logo fills, so a circular mask never cuts it. */
export const MASKABLE_SAFE_ZONE = 0.62;

/** The logo's most usable brand colours, best first — the same picker Android uses for wallpapers. */
export function extractColours(
	image: HTMLImageElement,
	crop: Crop = fitCrop(image),
	count = 4
): string[] {
	const canvas = document.createElement('canvas');
	const size = 128;
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [];
	drawCropped(ctx, image, crop, 0, 0, size);
	const { data } = ctx.getImageData(0, 0, size, size);

	const pixels: number[] = [];
	for (let i = 0; i < data.length; i += 4) {
		// Skip transparent pixels so a logo's empty background doesn't count.
		if (data[i + 3]! < 255) continue;
		pixels.push(((255 << 24) | (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!) >>> 0);
	}
	if (!pixels.length) return [];
	const ranked = Score.score(QuantizerCelebi.quantize(pixels, 128), {
		desired: count,
		filter: true
	});
	return ranked.map((argb) => hexFromArgb(argb));
}
