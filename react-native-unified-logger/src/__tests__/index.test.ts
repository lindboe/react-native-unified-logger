type Listener = (e: {
  level: number;
  tag: string;
  message: string;
  timestamp: number;
  source: string;
}) => void;

jest.mock('../NativeUnifiedLogger', () => {
  const m = {
    configure: jest.fn(),
    log: jest.fn(),
    listeners: [] as Array<(e: unknown) => void>,
    onLog: jest.fn((l: (e: unknown) => void) => {
      m.listeners.push(l);
      return {
        remove: () => {
          m.listeners = m.listeners.filter(x => x !== l);
        },
      };
    }),
    emit(e: unknown) {
      m.listeners.forEach(l => l(e));
    },
  };
  return { __esModule: true, default: m };
});

type MockNative = {
  configure: jest.Mock;
  log: jest.Mock;
  listeners: Listener[];
  onLog: jest.Mock;
  emit: (e: Parameters<Listener>[0]) => void;
};
const mockNative = (
  jest.requireMock('../NativeUnifiedLogger') as { default: MockNative }
).default;

import {
  configureLogger,
  createLogger,
  formatMessage,
  getLoggerConfig,
  log,
  resetLogger,
} from '../index';

const consoleSpies = () => ({
  debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
  info: jest.spyOn(console, 'info').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {}),
});

let spies: ReturnType<typeof consoleSpies>;

beforeEach(() => {
  spies = consoleSpies();
  mockNative.configure.mockClear();
  mockNative.log.mockClear();
  resetLogger();
  mockNative.configure.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('defaults', () => {
  test('resetLogger configures native with platformSpecific defaults', () => {
    resetLogger();
    expect(mockNative.configure).toHaveBeenLastCalledWith({
      forwardToJs: false,
      logLocally: true,
      minLevel: 0,
    });
    expect(getLoggerConfig()).toEqual({
      localDestination: 'platformSpecific',
      minLevel: 'debug',
      defaultTag: 'App',
      hasCallback: false,
    });
  });

  test('JS logs go to console with the tag prefix', () => {
    log.info('hello', { a: 1 });
    expect(spies.info).toHaveBeenCalledWith('[App] hello {"a":1}');
    log.warn('careful');
    expect(spies.warn).toHaveBeenCalledWith('[App] careful');
    expect(mockNative.log).not.toHaveBeenCalled();
  });

  test('createLogger uses its own tag', () => {
    createLogger('Net').error('boom');
    expect(spies.error).toHaveBeenCalledWith('[Net] boom');
  });
});

describe('callback', () => {
  test('setting a callback defaults localDestination to none and forwards native', () => {
    const cb = jest.fn();
    configureLogger({ callback: cb });
    expect(getLoggerConfig().localDestination).toBe('none');
    expect(mockNative.configure).toHaveBeenLastCalledWith({
      forwardToJs: true,
      logLocally: false,
      minLevel: 0,
    });
    log.info('x');
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        tag: 'App',
        message: 'x',
        source: 'js',
      }),
    );
    expect(spies.info).not.toHaveBeenCalled();
    expect(mockNative.log).not.toHaveBeenCalled();
  });

  test('native entries reach the callback with mapped level and source', () => {
    const cb = jest.fn();
    configureLogger({ callback: cb });
    mockNative.emit({
      level: 2,
      tag: 'Lifecycle',
      message: 'resumed',
      timestamp: 123,
      source: 'android',
    });
    expect(cb).toHaveBeenCalledWith({
      level: 'warn',
      tag: 'Lifecycle',
      message: 'resumed',
      timestamp: 123,
      source: 'android',
    });
    expect(spies.warn).not.toHaveBeenCalled();
  });

  test('a throwing callback is contained', () => {
    configureLogger({
      callback: () => {
        throw new Error('sink down');
      },
    });
    expect(() => log.info('x')).not.toThrow();
    expect(spies.error).toHaveBeenCalled();
  });

  test('removing the callback restores platformSpecific and unsubscribes', () => {
    const cb = jest.fn();
    configureLogger({ callback: cb });
    expect(mockNative.listeners).toHaveLength(1);
    configureLogger({ callback: null });
    expect(mockNative.listeners).toHaveLength(0);
    expect(getLoggerConfig().localDestination).toBe('platformSpecific');
  });
});

describe('localDestination', () => {
  test('native: JS entries go to the native log only', () => {
    configureLogger({ localDestination: 'native' });
    log.debug('d');
    expect(mockNative.log).toHaveBeenCalledWith(0, 'App', 'd');
    expect(spies.debug).not.toHaveBeenCalled();
    expect(mockNative.configure).toHaveBeenLastCalledWith({
      forwardToJs: false,
      logLocally: true,
      minLevel: 0,
    });
  });

  test('js: native entries are printed to the console, native logs nothing locally', () => {
    configureLogger({ localDestination: 'js' });
    expect(mockNative.configure).toHaveBeenLastCalledWith({
      forwardToJs: true,
      logLocally: false,
      minLevel: 0,
    });
    mockNative.emit({
      level: 3,
      tag: 'Core',
      message: 'bad',
      timestamp: 1,
      source: 'ios',
    });
    expect(spies.error).toHaveBeenCalledWith('[Core] bad');
  });

  test('callback plus platformSpecific keeps local output', () => {
    const cb = jest.fn();
    configureLogger({ callback: cb, localDestination: 'platformSpecific' });
    log.info('both');
    expect(cb).toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledWith('[App] both');
    expect(mockNative.configure).toHaveBeenLastCalledWith({
      forwardToJs: true,
      logLocally: true,
      minLevel: 0,
    });
  });
});

describe('re-configuring', () => {
  test('an explicit destination survives later calls that omit it', () => {
    configureLogger({ localDestination: 'native' });
    configureLogger({ callback: jest.fn() });
    expect(getLoggerConfig().localDestination).toBe('native');
    configureLogger({ minLevel: 'info' });
    expect(getLoggerConfig().localDestination).toBe('native');
  });

  test('a derived destination follows the callback', () => {
    configureLogger({ callback: jest.fn() });
    expect(getLoggerConfig().localDestination).toBe('none');
    configureLogger({ minLevel: 'info' });
    expect(getLoggerConfig().localDestination).toBe('none');
    configureLogger({ callback: null });
    expect(getLoggerConfig().localDestination).toBe('platformSpecific');
  });
});

describe('minLevel and tags', () => {
  test('entries below minLevel are dropped in JS and sent to native', () => {
    configureLogger({ minLevel: 'warn' });
    log.info('nope');
    log.error('yes');
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledWith('[App] yes');
    expect(mockNative.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ minLevel: 2 }),
    );
  });

  test('defaultTag changes the default logger tag', () => {
    configureLogger({ defaultTag: 'Demo' });
    expect(log.tag).toBe('Demo');
    log.info('x');
    expect(spies.info).toHaveBeenCalledWith('[Demo] x');
  });
});

describe('native entry filtering', () => {
  test('entries below minLevel are dropped even if native emitted them', () => {
    const cb = jest.fn();
    configureLogger({ callback: cb, minLevel: 'warn' });
    mockNative.emit({
      level: 1,
      tag: 'T',
      message: 'late',
      timestamp: 1,
      source: 'ios',
    });
    expect(cb).not.toHaveBeenCalled();
    mockNative.emit({
      level: NaN,
      tag: 'T',
      message: 'nan',
      timestamp: 1,
      source: 'ios',
    });
    expect(cb).not.toHaveBeenCalled();
    configureLogger({ minLevel: 'debug' });
    mockNative.emit({
      level: NaN,
      tag: 'T',
      message: 'nan',
      timestamp: 1,
      source: 'ios',
    });
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'debug' }),
    );
  });
});

describe('formatMessage', () => {
  test('formats like console.log', () => {
    const err = new Error('e');
    expect(formatMessage('a', [1, { b: 2 }, undefined, null])).toBe(
      'a 1 {"b":2} undefined null',
    );
    expect(formatMessage(err, [])).toContain('Error: e');
    expect(formatMessage({ x: 1 }, [])).toBe('{"x":1}');
  });
});
