import type { LogEntry } from '../src/index';

export * from '../src/index';

/** Every entry that passed `minLevel` since the last `resetLogger()`. */
export const __entries: LogEntry[];

/**
 * Simulate a native-originated entry. Filtered by `minLevel`, recorded in
 * `__entries` and handed to the callback. `source` defaults to `nativeSource`,
 * `timestamp` to now, `tag` to `App`, `level` to `debug`.
 */
export function __emitNative(entry: Partial<LogEntry>): void;
