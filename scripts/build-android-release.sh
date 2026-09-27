#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-/home/ubuntu/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export EXPO_NO_DOTENV=1
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
export WHIP_BUILD_ROOT="${WHIP_BUILD_ROOT:-/dev/shm/whip-android-release-$UID}"
if [[ -z "${CARGO_TARGET_DIR:-}" ]]; then
  if [[ -d "/run/whip-android-rust-$UID" ]]; then
    export CARGO_TARGET_DIR="/run/whip-android-rust-$UID"
  else
    export CARGO_TARGET_DIR="$WHIP_BUILD_ROOT/rust-target"
  fi
fi
mkdir -p "$WHIP_BUILD_ROOT" "$CARGO_TARGET_DIR"
export WHIP_BUILD_ROOT="$(realpath "$WHIP_BUILD_ROOT")"
export CARGO_TARGET_DIR="$(realpath "$CARGO_TARGET_DIR")"
for directory in "$WHIP_BUILD_ROOT" "$CARGO_TARGET_DIR"; do
  fs_type="$(findmnt -n -o FSTYPE -T "$directory")"
  if [[ "$fs_type" != tmpfs && "$fs_type" != ext4 ]]; then
    echo "Build output must be on tmpfs or ext4: $directory ($fs_type)" >&2
    exit 1
  fi
done
exec 9>"$WHIP_BUILD_ROOT/.build.lock"
flock -n 9 || { echo 'Another Release build is using this cache' >&2; exit 1; }

cd "$repo_dir/android"
./gradlew :app:assembleRelease \
  --init-script "$repo_dir/scripts/android-release-tmpfs.init.gradle" \
  -PreactNativeArchitectures=arm64-v8a \
  -Pwhip.previewSigning=true \
  --build-cache --max-workers=4 --console=plain

apk_path="$(python3 - "$WHIP_BUILD_ROOT" <<'PY'
import pathlib, sys
paths = list(pathlib.Path(sys.argv[1], 'gradle').glob('app-*/outputs/apk/release/app-release.apk'))
if len(paths) != 1:
    raise SystemExit(f'Expected one Release APK, found {len(paths)}')
print(paths[0])
PY
)"
build_tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
python3 - "$apk_path" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    bad = archive.testzip()
    if bad is not None:
        raise SystemExit(f'Bad APK ZIP entry: {bad}')
    abis = {name.split('/')[1] for name in archive.namelist() if name.startswith('lib/') and name.endswith('.so')}
    if abis != {'arm64-v8a'}:
        raise SystemExit(f'Unexpected APK architectures: {abis}')
print('APK ZIP CRC and arm64 architecture checks passed')
PY
"$build_tools/aapt2" dump badging "$apk_path" > /dev/null
"$build_tools/apksigner" verify "$apk_path"
"$build_tools/zipalign" -c -P 16 4 "$apk_path"

destination="$repo_dir/android/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$(dirname "$destination")"
cp "$apk_path" "$destination"
python3 - "$apk_path" "$destination" <<'PY'
import hashlib, pathlib, sys, zipfile
def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
original, copied = map(digest, sys.argv[1:])
if original != copied:
    raise SystemExit('Copied APK checksum mismatch')
with zipfile.ZipFile(sys.argv[2]) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Copied APK ZIP CRC failed')
print(f'Validated Release: {sys.argv[2]}')
print(f'SHA256: {copied}')
print(f'Bytes: {pathlib.Path(sys.argv[2]).stat().st_size}')
PY
echo "Incremental build cache retained: $WHIP_BUILD_ROOT"
echo "Rust build cache retained: $CARGO_TARGET_DIR"
