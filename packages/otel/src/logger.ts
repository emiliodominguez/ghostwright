import pino, { type Logger } from 'pino';

/**
 * Create a structured logger bound to a service/component name.
 *
 * @param name - component name attached to every line as `name`.
 * @returns a configured pino logger.
 */
export function createLogger(name: string): Logger {
	return pino({
		name,
		level: process.env.LOG_LEVEL ?? 'info',
	});
}
