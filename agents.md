# Android release build notes

This is the Whip project-local build note. The project-wide filesystem and
artifact-location rules are in `AGENTS.md`; this file records the Whip-specific
toolchain relationships and commands.

## Version relationships

- Android Gradle Plugin: `8.12.0`, declared in `android/buildSrc/build.gradle`.
- Gradle Wrapper: `8.13`, declared in
  `android/gradle/wrapper/gradle-wrapper.properties`; this is the compatible
  Gradle version for AGP `8.12.0`.
- Java: JDK `17`, required by this AGP line.
- Android SDK: compile/target SDK `36`; Build Tools `36.0.0`.
- Android NDK: `27.1.12297006`.
- Kotlin: `2.1.20`.
- React Native: `0.86.3`; Expo SDK: `57`; Hermes is enabled.
- The local `react-native-whip-ssh` native library currently provides only
  `arm64-v8a`, so pass `-PreactNativeArchitectures=arm64-v8a` for this build.

Changing one of these versions may require changing the compatible Gradle,
Android SDK/Build Tools, Kotlin, or NDK version as a set. Do not restore
Gradle `9.x` while keeping AGP `8.12.0`.

## Root cause of the package-parsing failure

The workspace is on `/Documents`, which is a ZFS filesystem. Large ZIP/JAR/APK
files produced directly there by Gradle/Java have repeatedly been observed with
valid ZIP directory metadata but corrupted entry data. The resulting APK may
make Gradle report `BUILD SUCCESSFUL`, while `unzip -t`, `aapt2`, or
`apksigner` reports CRC errors, invalid deflate data, or a corrupt manifest.
Never distribute an APK that has not passed all of those checks.

The project uses Android Gradle Plugin 8.12.0, whose compatible Gradle version
is 8.13. Keep `android/gradle/wrapper/gradle-wrapper.properties` on Gradle
8.13. The SSH native module currently supplies only `arm64-v8a`, so release
builds must explicitly select that ABI.

## Reproducible local release build

Set the Android environment in the build shell:

```bash
export ANDROID_HOME=/home/ubuntu/Android/Sdk
export ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk
export EXPO_NO_DOTENV=1
export WHIP_GRADLE_BUILD_ROOT=/dev/shm/whip-gradle-build
```

Create a temporary Gradle init script outside the repository. It redirects
only the `:app` output to tmpfs; native dependency/CMake outputs remain in
their normal project directories:

```groovy
allprojects {
    def tmpBuildRoot = new File(
        System.getenv('WHIP_GRADLE_BUILD_ROOT') ?: '/dev/shm/whip-gradle-build'
    )
    if (path == ':app') {
        buildDir = new File(tmpBuildRoot, 'app')
    }
}
```

From `android/`, use a clean, single-worker build. For a local installable
preview APK, use the existing preview signing and skip R8 when tmpfs space is
limited:

```bash
./gradlew clean --no-daemon --no-parallel --max-workers=1 \
  --init-script /path/to/temporary-build.gradle

./gradlew assembleRelease --no-daemon --no-parallel --max-workers=1 \
  --init-script /path/to/temporary-build.gradle \
  -Pwhip.previewSigning=true \
  -Pwhip.skipR8=true \
  -PreactNativeArchitectures=arm64-v8a
```

`-Pwhip.skipR8=true` still builds the `release` variant, but is intended for
local preview/testing rather than store distribution. For an optimized release
with enough tmpfs space, omit that property. For a real distribution build,
omit `-Pwhip.previewSigning=true` and provide the uncommitted upload-signing
properties through the normal project mechanism.

The APK is initially at:

```text
/dev/shm/whip-gradle-build/app/outputs/apk/release/app-release.apk
```

The corresponding Android App Bundle, when building `bundleRelease`, is at:

```text
/dev/shm/whip-gradle-build/app/outputs/bundle/release/app-release.aab
```

Only after validation should these be copied to:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

Validate that tmpfs copy before copying it back to the repository output path.
Then validate the copied file again:

```bash
APK=/dev/shm/whip-gradle-build/app/outputs/apk/release/app-release.apk
BT=/home/ubuntu/Android/Sdk/build-tools/36.0.0
unzip -t "$APK"
"$BT/aapt2" dump badging "$APK"
"$BT/apksigner" verify --verbose "$APK"
"$BT/zipalign" -c -v 4 "$APK"

cp "$APK" android/app/build/outputs/apk/release/app-release.apk
APK=android/app/build/outputs/apk/release/app-release.apk
unzip -t "$APK"
"$BT/aapt2" dump badging "$APK"
"$BT/apksigner" verify --verbose "$APK"
"$BT/zipalign" -c -v 4 "$APK"
```

`zipalign` alone is not an integrity check; `unzip -t` is required to catch
bad CRC or deflate data. Do not commit the temporary init script, signing
properties, passwords, or keystores.
