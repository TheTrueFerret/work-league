import { hexFromArgb, QuantizerCelebi, Score } from '@material/material-color-utilities';

/**
 * Browser-only helpers for the admin logo upload. Resizing happens here, in a
 * canvas, so the server never needs an image library (which would not run
 * on Cloudflare Workers anyway).
 */

export function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('That file is not an image this browser can read'));
		image.src = url;
	});
}

interface IconSpec {
	readonly size: number;
	/** How much of the square the logo fills. */
	readonly scale: number;
	/** Solid background, for icons the OS crops (maskable, Apple). */
	readonly background?: string;
}

function render(image: HTMLImageElement, spec: IconSpec): string {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = spec.size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser cannot draw images');
	if (spec.background) {
		ctx.fillStyle = spec.background;
		ctx.fillRect(0, 0, spec.size, spec.size);
	}
	const box = spec.size * spec.scale;
	const ratio = Math.min(box / image.naturalWidth, box / image.naturalHeight);
	const w = image.naturalWidth * ratio;
	const h = image.naturalHeight * ratio;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(image, (spec.size - w) / 2, (spec.size - h) / 2, w, h);
	return canvas.toDataURL('image/png');
}

/** Every icon the app needs, as PNG data URLs keyed by their published file name. */
export function renderIcons(image: HTMLImageElement, background: string): Record<string, string> {
	return {
		'logo.png': render(image, { size: 256, scale: 1 }),
		'icon-192.png': render(image, { size: 192, scale: 1 }),
		'icon-512.png': render(image, { size: 512, scale: 1 }),
		// Android crops maskable icons to a circle; keep the logo inside the safe zone.
		'icon-maskable-512.png': render(image, { size: 512, scale: 0.62, background }),
		'apple-touch-icon.png': render(image, { size: 180, scale: 0.78, background })
	};
}

/** The logo's most usable brand colours, best first — the same picker Android uses for wallpapers. */
export function extractColours(image: HTMLImageElement, count = 4): string[] {
	const canvas = document.createElement('canvas');
	const size = 128;
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [];
	ctx.drawImage(image, 0, 0, size, size);
	const { data } = ctx.getImageData(0, 0, size, size);

	const pixels: number[] = [];
	for (let i = 0; i < data.length; i += 4) {
		// Skip transparent pixels so a logo's empty background doesn't count.
		if (data[i + 3]! < 255) continue;
		pixels.push(((255 << 24) | (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!) >>> 0);
	}
	if (!pixels.length) return [];
	const ranked = Score.score(QuantizerCelebi.quantize(pixels, 128), { desired: count, filter: true });
	return ranked.map((argb) => hexFromArgb(argb));
}
