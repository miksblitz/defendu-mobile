const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Resolve firebase subpaths (firebase/auth, firebase/database) via package.json "exports"
config.resolver ??= {};
config.resolver.unstable_enablePackageExports = true;

// So the phone can connect over Wi-Fi: server must listen on all interfaces, not just localhost.
config.server = {
  ...config.server,
  host: '0.0.0.0',
};

module.exports = config;
