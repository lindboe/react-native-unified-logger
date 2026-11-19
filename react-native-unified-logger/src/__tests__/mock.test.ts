/**
 * The shipped Jest mock (`react-native-unified-logger/jest/mock`) must apply
 * the same routing rules as the real library, so consumer tests written
 * against the mock hold against the real thing.
 */
import * as mock from '../../jest/mock';
import * as real from '../index';

type Api = typeof real & {
  __entries: real.LogEntry[];
  __emitNative: (e: Partial<real.LogEntry>) => void;
};
const m = mock as unknown as Api;

jest.mock('../NativeUnifiedLogger', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    log: jest.fn(),
    onLog: jest.fn(() => ({ remove: () => {} })),
  },
}));

beforeEach(() => {
  m.resetLogger();
  real.resetLogger();
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('exports the same API surface', () => {
  const realKeys = Object.keys(real).sort();
  const mockKeys = Object.keys(m)
    .filter(k => !k.startsWith('__'))
    .sort();
  expect(mockKeys).toEqual(realKeys);
});

test('minLevel filters entries before the callback, like the real library', () => {
  const realCb = jest.fn();
  const mockCb = jest.fn();
  real.configureLogger({ minLevel: 'warn', callback: realCb });
  m.configureLogger({ minLevel: 'warn', callback: mockCb });
  real.log.debug('x');
  m.log.debug('x');
  real.log.error('y');
  m.log.error('y');
  expect(realCb).toHaveBeenCalledTimes(1);
  expect(mockCb).toHaveBeenCalledTimes(1);
  expect(m.__entries.map(e => e.message)).toEqual(['y']);
});

test('an explicit localDestination survives later calls, like the real library', () => {
  for (const api of [real, m]) {
    api.configureLogger({ localDestination: 'js' });
    api.configureLogger({ callback: jest.fn() });
    expect(api.getLoggerConfig().localDestination).toBe('js');
    api.resetLogger();
    api.configureLogger({ callback: jest.fn() });
    expect(api.getLoggerConfig().localDestination).toBe('none');
  }
});

test('formatMessage matches the real implementation', () => {
  const cases: Array<[unknown, unknown[]]> = [
    ['a', [1, { b: 2 }, undefined, null]],
    [{ x: 1 }, []],
    [function named() {}, [() => {}]],
    [new Error('e'), []],
  ];
  for (const [msg, rest] of cases) {
    expect(m.formatMessage(msg, rest)).toBe(real.formatMessage(msg, rest));
  }
});

test('__emitNative applies minLevel and defaults source to nativeSource', () => {
  const cb = jest.fn();
  m.configureLogger({ minLevel: 'info', callback: cb });
  m.__emitNative({ level: 'debug', message: 'dropped' });
  m.__emitNative({ level: 'warn', tag: 'Native', message: 'kept' });
  expect(cb).toHaveBeenCalledTimes(1);
  expect(cb).toHaveBeenCalledWith(
    expect.objectContaining({
      level: 'warn',
      tag: 'Native',
      message: 'kept',
      source: m.nativeSource,
    }),
  );
});

test('nativeSource matches the real value for this platform', () => {
  expect(m.nativeSource).toBe(real.nativeSource);
});
