module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // Must be last: workletizes functions for react-native-reanimated.
    // Explicit because pnpm's isolated layout can hide it from babel-preset-expo's auto-detection.
    plugins: ['react-native-worklets/plugin'],
  };
};
