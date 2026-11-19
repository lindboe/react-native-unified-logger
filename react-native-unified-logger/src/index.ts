import { Platform } from 'react-native';
import NativeUnifiedLogger from './NativeUnifiedLogger';
import type { NativeLogEntry } from './NativeUnifiedLogger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Where an entry was produced. */
export type LogSource = 'js' | 'ios' | 'android';

export type LogEntry = {
  level: LogLevel;
  tag: string;
  message: string;
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  source: LogSource;
};

export type LogCallback = (entry: LogEntry) => void;

/**
 * Where entries show up locally.
 *
 * - `platformSpecific`: JS entries go to the JS console (which React Native
 *   itself mirrors to os_log / logcat under its generic "javascript" /
 *   "ReactNativeJS" tag); native entries go to os_log / logcat with their
 *   own tag and level. This is the default when no callback is set.
 * - `none`: nothing is written locally. This is the default when a callback is set.
 * - `js`: every entry, including native ones, is written to the JS console only.
 * - `native`: every entry, including JS ones, is written to os_log / logcat
 *   only, with its real tag and level. JS entries never touch the JS console,
 *   so they do not appear in Metro or React Native DevTools.
 */
export type LocalDestination = 'platformSpecific' | 'none' | 'js' | 'native';

export type LoggerOptions = {
  /**
   * Receives every entry from every layer (JS, iOS, Android). Intended for
   * remote logging. Pass `null` to remove a previously set callback.
   */
  callback?: LogCallback | null;
  /** See {@link LocalDestination}. */
  localDestination?: LocalDestination;
  /** Entries below this level are dropped in every layer. Default: `debug`. */
  minLevel?: LogLevel;
  /** Tag used by the default `log` instance. Default: `App`. */
  defaultTag?: string;
};

export interface Logger {
  readonly tag: string;
  debug(message: unknown, ...rest: unknown[]): void;
  info(message: unknown, ...rest: unknown[]): void;
  warn(message: unknown, ...rest: unknown[]): void;
  error(message: unknown, ...rest: unknown[]): void;
  log(level: LogLevel, message: unknown, ...rest: unknown[]): void;
}

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const LEVEL_INDEX: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

type State = {
  callback: LogCallback | null;
  localDestination: LocalDestination;
  /** The destination the user chose explicitly, if any; otherwise derived from the callback. */
  explicitDestination: LocalDestination | null;
  minLevel: LogLevel;
  defaultTag: string;
};

const DEFAULTS: State = {
  callback: null,
  localDestination: 'platformSpecific',
  explicitDestination: null,
  minLevel: 'debug',
  defaultTag: 'App',
};

let state: State = { ...DEFAULTS };
let subscription: { remove(): void } | null = null;

function levelFromNumber(n: number): LogLevel {
  if (!Number.isFinite(n)) return 'debug';
  return LEVELS[Math.min(Math.max(Math.trunc(n), 0), 3)] as LogLevel;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  if (value === undefined) return 'undefined';
  if (typeof value === 'function')
    return `[Function ${value.name || 'anonymous'}]`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/**
 * Formats a message plus extra arguments into one string: strings as is,
 * Errors as their stack, everything else JSON-stringified, joined by spaces.
 */
export function formatMessage(message: unknown, rest: unknown[]): string {
  if (rest.length === 0) return formatValue(message);
  return [message, ...rest].map(formatValue).join(' ');
}

// Note: console.warn/console.error are React Native's own console. In dev
// they also surface in LogBox; in all builds console.error is reported to the
// native ExceptionsManager as a non-fatal exception (see README).
function writeToConsole(entry: LogEntry): void {
  const line = `[${entry.tag}] ${entry.message}`;
  switch (entry.level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
}

let inCallback = false;

function invokeCallback(entry: LogEntry): void {
  const cb = state.callback;
  if (!cb) return;
  // An entry logged from inside the callback (directly or through code it
  // calls) still goes to its local destination but is not fed back into the
  // callback, so a sink that logs its own failures cannot recurse.
  if (inCallback) return;
  inCallback = true;
  try {
    cb(entry);
  } catch (e) {
    // Never let a failing remote sink take the app down.
    console.error('[react-native-unified-logger] callback threw:', e);
  } finally {
    inCallback = false;
  }
}

function dispatchJsEntry(entry: LogEntry): void {
  if (LEVEL_INDEX[entry.level] < LEVEL_INDEX[state.minLevel]) return;
  invokeCallback(entry);
  switch (state.localDestination) {
    case 'platformSpecific':
    case 'js':
      writeToConsole(entry);
      break;
    case 'native':
      NativeUnifiedLogger.log(
        LEVEL_INDEX[entry.level],
        entry.tag,
        entry.message,
      );
      break;
    case 'none':
      break;
  }
}

function handleNativeEntry(raw: NativeLogEntry): void {
  const entry: LogEntry = {
    level: levelFromNumber(raw.level),
    tag: raw.tag,
    message: raw.message,
    timestamp: raw.timestamp,
    source: raw.source === 'ios' ? 'ios' : 'android',
  };
  // Native applies minLevel too, but its configure call is asynchronous; an
  // entry emitted just before a raised minLevel landed is filtered here.
  if (LEVEL_INDEX[entry.level] < LEVEL_INDEX[state.minLevel]) return;
  invokeCallback(entry);
  if (state.localDestination === 'js') {
    writeToConsole(entry);
  }
}

function syncNative(): void {
  const forwardToJs =
    state.callback !== null || state.localDestination === 'js';
  if (forwardToJs && subscription === null) {
    subscription = NativeUnifiedLogger.onLog(handleNativeEntry);
  } else if (!forwardToJs && subscription !== null) {
    subscription.remove();
    subscription = null;
  }
  NativeUnifiedLogger.configure({
    forwardToJs,
    logLocally:
      state.localDestination === 'platformSpecific' ||
      state.localDestination === 'native',
    minLevel: LEVEL_INDEX[state.minLevel],
  });
}

/**
 * Configure routing for all layers. Options not passed keep their current
 * value. `localDestination` defaults to `platformSpecific` without a callback
 * and `none` with one; once set explicitly it is kept until `resetLogger` is
 * called or a new value is passed.
 */
export function configureLogger(options: LoggerOptions = {}): void {
  const callback =
    options.callback === undefined ? state.callback : options.callback;
  const explicitDestination =
    options.localDestination ?? state.explicitDestination;
  state = {
    callback,
    explicitDestination,
    localDestination:
      explicitDestination ?? (callback ? 'none' : 'platformSpecific'),
    minLevel: options.minLevel ?? state.minLevel,
    defaultTag: options.defaultTag ?? state.defaultTag,
  };
  syncNative();
}

/** Restore the defaults: no callback, `platformSpecific`, `debug`, tag `App`. */
export function resetLogger(): void {
  state = { ...DEFAULTS };
  syncNative();
}

/** The current configuration (read-only snapshot). */
export function getLoggerConfig(): Readonly<{
  localDestination: LocalDestination;
  minLevel: LogLevel;
  defaultTag: string;
  hasCallback: boolean;
}> {
  const { callback, localDestination, minLevel, defaultTag } = state;
  return {
    localDestination,
    minLevel,
    defaultTag,
    hasCallback: callback !== null,
  };
}

/** Create a logger bound to a tag. Tags become the logcat tag / os_log category. */
export function createLogger(tag: string): Logger {
  const emit = (level: LogLevel, message: unknown, rest: unknown[]) => {
    if (LEVEL_INDEX[level] < LEVEL_INDEX[state.minLevel]) return;
    dispatchJsEntry({
      level,
      tag,
      message: formatMessage(message, rest),
      timestamp: Date.now(),
      source: 'js',
    });
  };
  return {
    tag,
    debug: (m, ...r) => emit('debug', m, r),
    info: (m, ...r) => emit('info', m, r),
    warn: (m, ...r) => emit('warn', m, r),
    error: (m, ...r) => emit('error', m, r),
    log: (level, m, ...r) => emit(level, m, r),
  };
}

/** Default logger. Its tag follows `defaultTag` from {@link configureLogger}. */
export const log: Logger = {
  get tag() {
    return state.defaultTag;
  },
  debug: (m, ...r) => emitDefault('debug', m, r),
  info: (m, ...r) => emitDefault('info', m, r),
  warn: (m, ...r) => emitDefault('warn', m, r),
  error: (m, ...r) => emitDefault('error', m, r),
  log: (level, m, ...r) => emitDefault(level, m, r),
};

function emitDefault(level: LogLevel, message: unknown, rest: unknown[]): void {
  if (LEVEL_INDEX[level] < LEVEL_INDEX[state.minLevel]) return;
  dispatchJsEntry({
    level,
    tag: state.defaultTag,
    message: formatMessage(message, rest),
    timestamp: Date.now(),
    source: 'js',
  });
}

/** `'ios'` or `'android'`; the source value native entries will carry on this device. */
export const nativeSource: LogSource =
  Platform.OS === 'ios' ? 'ios' : 'android';

// Deliberately no configure call at import time: native keeps treating this
// runtime as unconfigured (retaining entries, bounded) until the app calls
// configureLogger or resetLogger, so a callback enabled later still receives
// startup entries, on a cold start and after a JS reload alike. Native's own
// defaults match `platformSpecific`.
