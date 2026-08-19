// Electron Builder Configuration for Universal (x64 + ARM64) macOS Build
const baseConfig = require('./electron-builder.js');

module.exports = {
  ...baseConfig,
  mac: {
    ...baseConfig.mac,
    target: [
      {
        target: 'dmg',
        arch: ['universal']
      }
    ],
    // Universal binary naming
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: '${productName}-${version}-universal.${ext}',
    // Universal build configuration for electron-builder 26.x
    // Enable ASAR merging for universal builds
    mergeASARs: true,
    // node-screenshots ships native bindings in architecture-specific package
    // folders. pnpm/electron-builder can include the same binding path in both
    // temporary apps, so @electron/universal must not try to lipo those files.
    x64ArchFiles: "**/node-screenshots-darwin-*/*.node",
    singleArchFiles: "**/node-screenshots-darwin-*/*",
    // Ensure native modules are unpacked
    asarUnpack: [
      ...baseConfig.asarUnpack,
      "**/*.node",
      "**/node-screenshots-*/**/*"
    ],
  },
  beforeBuild: async (context) => {
    console.log('🔨 Building Universal macOS app (x64 + ARM64)');
    console.log('   Target Architectures: x64, arm64');
    console.log('   Platform:', context.platform.name);
    console.log('   System Architecture:', process.arch);
    console.log('   📦 This will create a universal binary that runs natively on both Intel and Apple Silicon Macs');
    console.log('   🔧 Universal build configuration optimized for electron-builder 26.x');
    console.log('   📋 mergeASARs:', module.exports.mac.mergeASARs);
    console.log('   Using native module merge rules to avoid universal conflicts');
    return true;
  },
  afterPack: async (context) => {
    console.log('📦 Universal macOS packaging completed');
    console.log('   Output Directory:', context.outDir);
    console.log('   ✅ Universal binary created - works on both Intel and Apple Silicon Macs');
    return true;
  },
};
