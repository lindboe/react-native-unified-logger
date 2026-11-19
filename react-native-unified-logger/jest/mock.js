/* global jest */
/**
 * Jest mock for react-native-unified-logger.
 *
 * In your jest setup file:
 *   jest.mock('react-native-unified-logger', () =>
 *     require('react-native-unified-logger/jest/mock'),
 *   );
 *
 * Every entry that passes `minLevel` is recorded in `__entries` and handed to
 * the callback, exactly as the real library would; nothing is written to the
 * console or to native. Logger methods are `jest.fn()`s where Jest is present.
 */
const LEVELS = ['debug', 'info', 'warn', 'error'];
const LEVEL_INDEX = { debug: 0, info: 1, warn: 2, error: 3 };

const DEFAULTS = {
  localDestination: 'platformSpecific',
  minLevel: 'debug',
  defaultTag: 'App',
  hasCallback: false,
};

const entries = [];
let config = { ...DEFAULTS };
let callback = null;
/** The destination the test chose explicitly, kept across calls like the real library. */
let explicitDestination = null;
let inCallback = false;

const fn = typeof jest !== 'undefined' ? impl => jest.fn(impl) : impl => impl;

let nativeSource = 'ios';
try {
  // eslint-disable-next-line global-require
  nativeSource = require('react-native').Platform.OS === 'android' ? 'android' : 'ios';
} catch {
  // react-native not resolvable in this test environment; keep the default.
}

function formatValue(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function formatMessage(message, rest) {
  if (!rest || rest.length === 0) return formatValue(message);
  return [message, ...rest].map(formatValue).join(' ');
}

function passesMinLevel(level) {
  return LEVEL_INDEX[level] >= LEVEL_INDEX[config.minLevel];
}

function deliver(entry) {
  if (!passesMinLevel(entry.level)) return;
  entries.push(entry);
  if (callback && !inCallback) {
    inCallback = true;
    try {
      callback(entry);
    } finally {
      inCallback = false;
    }
  }
}

function makeLogger(tagOf) {
  const emit = (level, message, rest) =>
    deliver({
      level: LEVELS.includes(level) ? level : 'debug',
      tag: tagOf(),
      message: formatMessage(message, rest),
      timestamp: Date.now(),
      source: 'js',
    });
  return {
    get tag() {
      return tagOf();
    },
    debug: fn((m, ...r) => emit('debug', m, r)),
    info: fn((m, ...r) => emit('info', m, r)),
    warn: fn((m, ...r) => emit('warn', m, r)),
    error: fn((m, ...r) => emit('error', m, r)),
    log: fn((level, m, ...r) => emit(level, m, r)),
  };
}

function applyOptions(options) {
  if (options.callback !== undefined) callback = options.callback;
  if (options.localDestination !== undefined)
    explicitDestination = options.localDestination;
  config = {
    minLevel: options.minLevel ?? config.minLevel,
    defaultTag: options.defaultTag ?? config.defaultTag,
    localDestination:
      explicitDestination ?? (callback ? 'none' : 'platformSpecific'),
    hasCallback: callback !== null,
  };
}

module.exports = {
  __esModule: true,
  __entries: entries,
  /**
   * Simulate a native-originated entry. It is filtered by `minLevel`,
   * recorded in `__entries` and handed to the callback like a real one.
   * `source` defaults to `nativeSource`, `timestamp` to now, `tag` to `App`.
   */
  __emitNative: fn(entry =>
    deliver({
      level: 'debug',
      tag: 'App',
      message: '',
      source: nativeSource,
      timestamp: Date.now(),
      ...entry,
    }),
  ),
  configureLogger: fn((options = {}) => applyOptions(options)),
  resetLogger: fn(() => {
    callback = null;
    explicitDestination = null;
    entries.length = 0;
    config = { ...DEFAULTS };
  }),
  getLoggerConfig: fn(() => ({ ...config })),
  createLogger: fn(tag => makeLogger(() => tag)),
  log: makeLogger(() => config.defaultTag),
  formatMessage,
  nativeSource,
};
