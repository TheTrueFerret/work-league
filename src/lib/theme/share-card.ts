import { argbFromHex, Hct, hexFromArgb, TonalPalette } from '@material/material-color-utilities';
import { DEFAULT_SEED, isHexColour } from './palette';

/**
 * The picture chat apps show when someone pastes a league link (Open Graph
 * image): the league's logo, name and tagline on its brand colour, signed
 * "Work League". Drawn in the admin's browser, like the icons, so the server
 * needs no image library.
 */

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

/** Bump when the card's design changes, so every league redraws its card. */
const DESIGN = 1;

export const PRODUCT_NAME = 'Work League';

export interface ShareCardBranding {
	readonly name: string;
	readonly tagline: string;
	readonly seed: string;
	readonly logoVersion: number | null;
}

/** Everything the card shows. When it differs from the stored card's key, the card is stale. */
export const shareCardKey = (b: ShareCardBranding): string =>
	JSON.stringify([DESIGN, b.name, b.tagline, b.seed, b.logoVersion]);

/** Where the logo to draw on the card lives: the uploaded one, or Work League's own. */
export const shareCardLogoUrl = (logoVersion: number | null): string =>
	logoVersion ? `/brand/icon-512.png?v=${logoVersion}` : '/icons/icon-512.png';

export const DEFAULT_TAGLINE = 'Rankings, matches and an office championship.';

interface Inputs {
	readonly name: string;
	readonly tagline: string;
	readonly seed: string;
	/** The league's logo. */
	readonly logo: HTMLImageElement;
	/** True for an uploaded logo, which gets a tile behind it; the built-in icon has its own. */
	readonly customLogo: boolean;
	/** Work League's own icon, for the signature. */
	readonly mark: HTMLImageElement;
}

const FONT = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Inter, sans-serif`;

/** Breaks `text` into lines no wider than `width`, ending with "…" if it needs more than `max`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width <= width || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	if (lines.length <= max) return lines;

	const kept = lines.slice(0, max);
	let last = kept[max - 1];
	while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1).trimEnd();
	kept[max - 1] = `${last}…`;
	return kept;
}

function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

/** The card as a JPEG: small enough for every chat app's preview limits. */
export async function renderShareCard(input: Inputs): Promise<Blob> {
	const W = SHARE_CARD_WIDTH;
	const H = SHARE_CARD_HEIGHT;
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser cannot draw images');
	await document.fonts?.ready;

	// A vivid version of the brand colour, so even a greyish seed gives a lively card.
	const hct = Hct.fromInt(argbFromHex(isHexColour(input.seed) ? input.seed : DEFAULT_SEED));
	// A grey brand stays grey: its hue means nothing, so boosting it would invent a colour.
	const chroma = hct.chroma < 10 ? hct.chroma : Math.max(hct.chroma, 40);
	const brand = TonalPalette.fromHueAndChroma(hct.hue, chroma);
	const soft = TonalPalette.fromHueAndChroma(hct.hue, Math.min(chroma / 3, 16));
	const tone = (t: number) => hexFromArgb(brand.tone(t));

	// Background: deep brand colour, lit from the top left.
	const bg = ctx.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, tone(32));
	bg.addColorStop(1, tone(12));
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, H);

	// Soft rings, like balls on a table, bleeding off the right edge.
	const ring = (x: number, y: number, r: number, fill: string, alpha: number) => {
		ctx.globalAlpha = alpha;
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	};
	ring(W - 40, 40, 300, tone(50), 0.35);
	ring(W - 40, 40, 190, tone(60), 0.3);
	ring(W + 30, H - 60, 160, tone(45), 0.3);
	ctx.globalAlpha = 1;

	const pad = 80;
	const footerH = 92;

	// Logo: the uploaded one on a light tile; the built-in icon is already a tile.
	const tile = 248;
	const tileX = pad;
	const tileY = (H - footerH - tile) / 2 + 8;
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
	ctx.shadowBlur = 48;
	ctx.shadowOffsetY = 18;
	roundedRect(ctx, tileX, tileY, tile, tile, 60);
	ctx.fillStyle = input.customLogo ? hexFromArgb(soft.tone(97)) : tone(40);
	ctx.fill();
	ctx.restore();
	ctx.save();
	roundedRect(ctx, tileX, tileY, tile, tile, 60);
	ctx.clip();
	ctx.imageSmoothingQuality = 'high';
	const inner = input.customLogo ? tile * 0.78 : tile;
	ctx.drawImage(input.logo, tileX + (tile - inner) / 2, tileY + (tile - inner) / 2, inner, inner);
	ctx.restore();

	// Name and tagline, beside the logo.
	const textX = tileX + tile + 64;
	const textW = W - textX - pad;
	ctx.textBaseline = 'alphabetic';

	// The name on one line as large as fits; a long one wraps onto two at a smaller size.
	ctx.letterSpacing = '-1.5px';
	let nameSize = 96;
	const nameFits = () => {
		ctx.font = `800 ${nameSize}px ${FONT}`;
		return ctx.measureText(input.name).width <= textW;
	};
	while (nameSize > 68 && !nameFits()) nameSize -= 4;
	const nameLines = nameFits() ? [input.name] : wrap(ctx, input.name, textW, 2);
	const nameLead = nameSize * 1.08;
	ctx.letterSpacing = '0px';

	ctx.font = `500 34px ${FONT}`;
	const taglineLines = wrap(ctx, input.tagline.trim() || DEFAULT_TAGLINE, textW, 2);
	const taglineLead = 46;

	const blockH = nameLines.length * nameLead + 22 + taglineLines.length * taglineLead;
	let y = tileY + tile / 2 - blockH / 2 + nameSize * 0.8;

	ctx.fillStyle = '#ffffff';
	ctx.font = `800 ${nameSize}px ${FONT}`;
	ctx.letterSpacing = '-1.5px';
	for (const line of nameLines) {
		ctx.fillText(line, textX, y);
		y += nameLead;
	}
	ctx.letterSpacing = '0px';
	y += 22 - nameLead + taglineLead;
	ctx.fillStyle = hexFromArgb(soft.tone(90));
	ctx.font = `500 34px ${FONT}`;
	for (const line of taglineLines) {
		ctx.fillText(line, textX, y);
		y += taglineLead;
	}

	// Footer: what the league is for, and the Work League signature.
	const footerY = H - footerH;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
	ctx.fillRect(0, footerY, W, footerH);
	const mid = footerY + footerH / 2;

	ctx.textBaseline = 'middle';
	ctx.font = `600 26px ${FONT}`;
	ctx.fillStyle = hexFromArgb(soft.tone(85));
	ctx.fillText('Rankings  ·  Matches  ·  Championship', pad, mid);

	const markSize = 44;
	ctx.font = `800 30px ${FONT}`;
	ctx.letterSpacing = '-0.5px';
	const label = PRODUCT_NAME;
	const labelW = ctx.measureText(label).width;
	const markX = W - pad - labelW - 14 - markSize;
	ctx.save();
	roundedRect(ctx, markX, mid - markSize / 2, markSize, markSize, markSize * 0.22);
	ctx.clip();
	ctx.drawImage(input.mark, markX, mid - markSize / 2, markSize, markSize);
	ctx.restore();
	ctx.fillStyle = '#ffffff';
	ctx.fillText(label, markX + markSize + 14, mid + 1);
	ctx.letterSpacing = '0px';

	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the share card'))),
			'image/jpeg',
			0.9
		)
	);
}
