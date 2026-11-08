const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../src/shared');
const parentModules = path.resolve(projectRoot, '../node_modules').replace(/\\/g, '[\\\\/]');

const config = {
  watchFolders: [sharedRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    disableHierarchicalLookup: true,
    blockList: [new RegExp(`${parentModules}.*`)],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
