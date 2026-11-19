/**
 * Importing the library must not call native `configure`: native keeps
 * retaining entries for an unconfigured runtime until the app decides, so a
 * callback enabled later still receives startup logs (cold start and reload).
 */
jest.mock('../NativeUnifiedLogger', () => ({
  __esModule: true,
  default: { configure: jest.fn(), log: jest.fn(), onLog: jest.fn() },
}));

test('importing the module does not configure native', () => {
  jest.isolateModules(() => {
    require('../index');
  });
  const native = (
    jest.requireMock('../NativeUnifiedLogger') as {
      default: { configure: jest.Mock; onLog: jest.Mock };
    }
  ).default;
  expect(native.configure).not.toHaveBeenCalled();
  expect(native.onLog).not.toHaveBeenCalled();
});
