// The library's native module is not available under Jest; use its mock.
jest.mock('react-native-unified-logger', () =>
  require('react-native-unified-logger/jest/mock'),
);
