/**
 * A tiny dependency-free structured logger. Each line is a single JSON object with a
 * timestamp, level, component name, and any fields passed by the caller, written to
 * stdout (or stderr for `error`). The call signature matches what the codebase already
 * uses: `log.info({ fields }, 'message')`, with either argument optional.
 *
 * Levels are filtered by `LOG_LEVEL` (default `info`); set it to `debug` for more, or
 * `silent` to turn logging off.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;

type Level = Exclude<keyof typeof LEVELS, 'silent'>;

/** A structured logger bound to a component name. */
export interface Logger {
	debug: (obj?: Record<string, unknown> | string, msg?: string) => void;
	info: (obj?: Record<string, unknown> | string, msg?: string) => void;
	warn: (obj?: Record<string, unknown> | string, msg?: string) => void;
	error: (obj?: Record<string, unknown> | string, msg?: string) => void;
}

/** The active threshold from LOG_LEVEL, resolved once per logger creation. */
function threshold(): number {
	const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
	return LEVELS[configured as keyof typeof LEVELS] ?? LEVELS.info;
}

/**
 * Create a structured logger bound to a component name.
 *
 * @param name - component name attached to every line as `name`.
 * @returns a logger with debug/info/warn/error methods.
 */
export function createLogger(name: string): Logger {
	const min = threshold();

	const emit = (level: Level, objOrMsg?: Record<string, unknown> | string, maybeMsg?: string): void => {
		if (LEVELS[level] < min) return;

		// Support both `log.info('message')` and `log.info({ fields }, 'message')`.
		const fields = typeof objOrMsg === 'object' ? objOrMsg : {};
		const msg = typeof objOrMsg === 'string' ? objOrMsg : maybeMsg;

		const line = JSON.stringify({ level, time: Date.now(), name, ...fields, ...(msg ? { msg } : {}) });

		if (level === 'error') console.error(line);
		else console.log(line);
	};

	return {
		debug: (obj, msg) => emit('debug', obj, msg),
		info: (obj, msg) => emit('info', obj, msg),
		warn: (obj, msg) => emit('warn', obj, msg),
		error: (obj, msg) => emit('error', obj, msg),
	};
}
