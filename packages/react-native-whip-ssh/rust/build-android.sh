#!/usr/bin/env bash
set -euo pipefail

rust_dir="$(cd "$(dirname "$0")" && pwd)"
module_dir="$(cd "$rust_dir/.." && pwd)"
repo_dir="$(cd "$module_dir/../.." && pwd)"
target="aarch64-linux-android"
source_library="$rust_dir/target/$target/release/libwhip_ssh.a"
destination_library="$module_dir/android/src/main/jniLibs/arm64-v8a/libwhip_ssh.a"
ubrn="$repo_dir/node_modules/.bin/ubrn"

# Recent Android NDKs ship versioned target clang wrappers instead of the
# unversioned `${target}-clang` name expected by cc-rs and Rust's Android
# target defaults. Resolve the compiler from the active SDK so native builds
# work without requiring developers to create global symlinks.
android_sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
android_ndk_root="${ANDROID_NDK_ROOT:-${ANDROID_NDK_HOME:-}}"

if [[ -z "$android_ndk_root" && -n "$android_sdk_root" && -d "$android_sdk_root/ndk" ]]; then
  android_ndk_root="$(find "$android_sdk_root/ndk" -mindepth 1 -maxdepth 1 -type d -print | sort -V | tail -n 1)"
fi

if [[ -n "$android_ndk_root" ]]; then
  case "$(uname -s)" in
    Darwin) ndk_host_tag="darwin-x86_64" ;;
    Linux) ndk_host_tag="linux-x86_64" ;;
    *) ndk_host_tag="" ;;
  esac

  android_clang="$android_ndk_root/toolchains/llvm/prebuilt/$ndk_host_tag/bin/${target}24-clang"
  android_clangxx="${android_clang}++"
  android_llvm_ar="$android_ndk_root/toolchains/llvm/prebuilt/$ndk_host_tag/bin/llvm-ar"
  android_llvm_ranlib="$android_ndk_root/toolchains/llvm/prebuilt/$ndk_host_tag/bin/llvm-ranlib"

  if [[ -x "$android_clang" ]]; then
    export CC_aarch64_linux_android="$android_clang"
    export CXX_aarch64_linux_android="$android_clangxx"
    export AR_aarch64_linux_android="$android_llvm_ar"
    export RANLIB_aarch64_linux_android="$android_llvm_ranlib"
    export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$android_clang"
  fi
fi

if [[ ! -x "$ubrn" ]]; then
  echo "error: $ubrn is unavailable; install dependencies before building Android" >&2
  exit 1
fi

cargo build \
  --locked \
  --manifest-path "$rust_dir/Cargo.toml" \
  --target "$target" \
  --release

install -D -m 0644 "$source_library" "$destination_library"

(
  cd "$rust_dir"
  "$ubrn" generate jsi bindings \
    --library \
    --ts-dir "$module_dir/src/generated" \
    --cpp-dir "$module_dir/cpp/generated" \
    "$source_library"
)
