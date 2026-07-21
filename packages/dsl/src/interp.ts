/** Resolve a variable name to its current value, or undefined if unknown. */
export type VarLookup = (key: string) => string | undefined;

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Substitute `{{name}}` tokens in a string with values from `lookup`. Unknown
 * tokens are left verbatim (so a typo stays visible rather than becoming empty).
 * Purely textual — the same rule GI uses, which is why custom JS wraps vars in quotes.
 *
 * @param input - the raw string (a URL, field value, or JS snippet).
 * @param lookup - resolves a variable name to its value.
 * @returns the string with known tokens replaced.
 * @example interpolate('Hi {{name}}', (k) => ({ name: 'Ada' })[k]) // 'Hi Ada'
 */
export function interpolate(input: string, lookup: VarLookup): string {
	return input.replace(TOKEN, (whole, key: string) => lookup(key) ?? whole);
}
