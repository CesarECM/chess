const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Workaround: packed source map serializer (patchTransformFileForPackedMaps)
// uses the Metro Bundler before its transformer is initialized on Windows.
// Removing customSerializer falls back to Metro's default, which works correctly.
if (config.serializer && config.serializer.customSerializer) {
  delete config.serializer.customSerializer;
}

module.exports = config;
