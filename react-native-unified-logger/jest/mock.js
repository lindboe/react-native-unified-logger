/* global jest */
/**
 * Jest mock for react-native-unified-logger.
 *
 * In your jest setup file:
 *   jest.mock('react-native-unified-logger', () =>
 *     require('react-native-unified-logger/jest/mock'),
 *   );
 *
 * Every logger method records its calls in `__entries` (and `jest.fn()`s are
 * used where available) so tests can assert on what was logged.
 */
const entries = [];
let config = {
  localDestination: 'platformSpecific',
  minLevel: 'debug',
  defaultTag: 'App',
  hasCallback: false,
};
let callback = null;

const fn = typeof jest !== 'undefined' ? impl => jest.fn(impl) : impl => impl;

function formatMessage(message, rest) {
  const fmt = v => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
    if (v === undefined) return 'undefined';
    try {
      const j = JSON.stringify(v);
      return j === undefined ? String(v) : j;
    } catch {
      return String(v);
    }
  };
  return [message, ...(rest || [])].map(fmt).join(' ');
}

function makeLogger(tagOf) {
  const emit = (level, message, rest) => {
    const entry = {
      level,
      tag: tagOf(),
      message: formatMessage(message, rest),
      timestamp: Date.now(),
      source: 'js',
    };
    entries.push(entry);
    if (callback) callback(entry);
  };
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

module.exports = {
  __esModule: true,
  __entries: entries,
  /** Simulate a native-originated entry reaching the callback. */
  __emitNative: entry => {
    if (callback)
      callback({ source: 'android', timestamp: Date.now(), ...entry });
  },
  configureLogger: fn((options = {}) => {
    if (options.callback !== undefined) callback = options.callback;
    config = {
      ...config,
      ...(options.minLevel ? { minLevel: options.minLevel } : {}),
      ...(options.defaultTag ? { defaultTag: options.defaultTag } : {}),
      localDestination:
        options.localDestination ?? (callback ? 'none' : 'platformSpecific'),
      hasCallback: callback !== null,
    };
  }),
  resetLogger: fn(() => {
    callback = null;
    entries.length = 0;
    config = {
      localDestination: 'platformSpecific',
      minLevel: 'debug',
      defaultTag: 'App',
      hasCallback: false,
    };
  }),
  getLoggerConfig: fn(() => ({ ...config })),
  createLogger: fn(tag => makeLogger(() => tag)),
  log: makeLogger(() => config.defaultTag),
  formatMessage,
  nativeSource: 'ios',
};
