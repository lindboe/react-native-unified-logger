const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');
const libraryName = 'react-native-unified-logger';
const librarySource = path.join(root, libraryName, 'src', 'index.ts');

/**
 * Metro configuration for the workspace: the demo app lives next to the
 * library and both resolve their dependencies from the hoisted root
 * node_modules. Imports of the library are pointed at its TypeScript source
 * so edits show up without a build step. (A global `source` export condition
 * would be simpler, but it also changes how some react-native packages
 * resolve and breaks startup.)
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.join(root, 'node_modules')],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === libraryName) {
        return { type: 'sourceFile', filePath: librarySource };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
