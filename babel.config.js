// Workspace-level Babel config so Jest can transform the hoisted react-native
// package when running the library's tests from the workspace root.
module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
