const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Forces -Xskip-metadata-version-check on all Kotlin compile tasks.
 *
 * Needed because react-native-safe-area-context compiles with Kotlin 2.1.0
 * while Expo 57 pulls kotlin-stdlib 2.3.0 into the classpath. The 2.1.0
 * compiler rejects 2.3.0 stdlib metadata by default; this flag bypasses
 * the check while keeping full ABI compatibility.
 */
module.exports = function withKotlinCompat(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('Xskip-metadata-version-check')) {
      return mod;
    }
    mod.modResults.contents += `
subprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            freeCompilerArgs += ['-Xskip-metadata-version-check']
        }
    }
}
`;
    return mod;
  });
};
