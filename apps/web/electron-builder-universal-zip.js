// Electron Builder Configuration for Universal (x64 + ARM64) macOS ZIP update package
const universalConfig = require('./electron-builder-universal.js');

module.exports = {
  ...universalConfig,
  mac: {
    ...universalConfig.mac,
    target: [
      {
        target: 'zip',
        arch: ['universal']
      }
    ],
  },
};
