import { CHARS, FigletChar, FONT_HEIGHT } from "./fonts/ansi-shadow";

export type FigletFont = {
	name: string;
	height: number;
	chars: Record<string, FigletChar>;
};

const DEFAULT_FONT: FigletFont = {
	name: "ANSI Shadow",
	height: FONT_HEIGHT,
	chars: CHARS,
};

function getCharLines(font: FigletChar, lineIndex: number): string {
	if (lineIndex < font.length) {
		return font[lineIndex];
	}
	return "";
}

function getCharWidth(font: FigletChar): number {
	let max = 0;
	for (const line of font) {
		if (line.length > max) max = line.length;
	}
	return max;
}

const padCache = new WeakMap<Record<string, FigletChar>, Record<string, FigletChar>>();

function padCharLines(chars: Record<string, FigletChar>): Record<string, FigletChar> {
	const cached = padCache.get(chars);
	if (cached) return cached;

	const padded: Record<string, FigletChar> = {};
	for (const [key, charDef] of Object.entries(chars)) {
		const maxWidth = getCharWidth(charDef);
		padded[key] = charDef.map((line) => {
			if (line.length < maxWidth) {
				return line + " ".repeat(maxWidth - line.length);
			}
			return line;
		});
	}
	padCache.set(chars, padded);
	return padded;
}

export function renderFiglet(
	text: string,
	_options?: { font?: FigletFont; size?: number }
): string {
	const font = _options?.font ?? DEFAULT_FONT;
	const paddedChars = padCharLines(font.chars);
	const lines: string[] = [];

	for (let i = 0; i < font.height; i++) {
		let line = "";
		const chars = [...text.toUpperCase()];

		for (let c = 0; c < chars.length; c++) {
			const ch = chars[c];
			const charDef = paddedChars[ch] ?? paddedChars[" "];
			line += getCharLines(charDef, i);
		}

		lines.push(line);
	}

	while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
		lines.pop();
	}

	return lines.join("\n");
}

export function getAvailableFonts(): string[] {
	return ["ANSI Shadow"];
}

export function getFontByName(_name: string): FigletFont {
	return DEFAULT_FONT;
}
