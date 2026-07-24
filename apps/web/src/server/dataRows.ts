/**
 * Parsing for data-driven test inputs: CSV (headers on the first row) or a JSON array
 * of row objects. Kept dependency-free so it can be unit-tested without the router's
 * database/queue graph.
 */

/** Parse one CSV line, honoring double-quoted fields (with embedded commas and "" escapes). */
export function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inQuotes) {
			if (c === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (c === '"') inQuotes = false;
			else cur += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ',') {
			out.push(cur.trim());
			cur = '';
		} else cur += c;
	}

	out.push(cur.trim());
	return out;
}

/**
 * Parse pasted data into rows. A leading `[` is treated as a JSON array of objects;
 * anything else is CSV with headers on the first line. Empty input yields no rows.
 *
 * @param text - the pasted CSV or JSON.
 * @returns one record per row, every value coerced to a string.
 */
export function parseDataRows(text: string): Record<string, string>[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	if (trimmed.startsWith('[')) {
		let arr: unknown;
		try {
			arr = JSON.parse(trimmed);
		} catch {
			throw new Error('data is not valid JSON');
		}

		if (!Array.isArray(arr)) throw new Error('JSON data must be an array of row objects');

		return (arr as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
	}

	const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];

	const headers = parseCsvLine(lines[0] ?? '');
	return lines.slice(1).map((line) => {
		const cells = parseCsvLine(line);
		return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
	});
}
