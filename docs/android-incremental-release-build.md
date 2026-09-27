# 本地 Android Release 增量编译

运行：

```bash
bash scripts/build-android-release.sh
```

脚本固定使用 arm64-v8a、preview signing、正常 R8/资源压缩，指定 Android SDK 并禁用 Expo dotenv。APK 在 tmpfs/ext4 上生成，经过 ZIP CRC、ABI、aapt2、apksigner、16KB zipalign 验证后，复制并复验到 `android/app/build/outputs/apk/release/app-release.apk`。脚本不安装设备、不执行 clean。

默认 Gradle 输出目录是 `/dev/shm/whip-android-release-<UID>`。当前机器另建立 `/run/whip-android-rust-1000` 存放 Rust Android release 与绑定生成器缓存，避免挤占已有其他任务的 tmpfs 测试目录。脚本在此目录存在时自动使用它，否则使用 Gradle 输出目录的 `rust-target` 子目录。可用 `WHIP_BUILD_ROOT`、`CARGO_TARGET_DIR` 指向其他 tmpfs/ext4 目录；脚本拒绝在其他文件系统直接构建。

保持相同路径、架构和构建参数，不清理这些目录，Gradle 与 Cargo 会复用未变化的产物。仅 JS 修改时，通常重做 Metro/Hermes 和 APK 打包；Rust 修改仍需编译相应 crate、原生链接；Java/Kotlin/原生依赖变化可能再次触发 R8。增量编译不能保证每一轮都跳过 R8。

这些中间文件有明确后续增量用途，因此保留；单次日志在问题解决、结果归档后可删除。不要自动清理其他任务的缓存。内存盘缓存占用内存/交换空间，并在机器重启后丢失；需要跨重启保留时，应将上述目录放到真正的 ext4 卷。此前两次构建采用每轮新目录并最终清理，后续无法复用完整 Android 编译产物。

init script 同时重定向所有 Gradle 子项目和 included plugin builds，路径按源项目目录稳定散列。RN settings 的固定位置 autolinking JSON 在根项目配置前复制到重定向路径；避免 app 配置阶段找不到该文件。

## 2026-09-27 实际验证

- Claude 修改后的 Rust 与 JS 源码已完成正常 Release 编译，未跳过 Rust/R8。首次主构建 **20m53s**：781 tasks，547 executed、81 from cache、153 up-to-date；其中 Rust Android optimized build **6m12s**。新目录配置前两次短失败分别为 autolinking JSON复制时机及 Cargo PATH，均已由构建脚本修正。
- 同路径、同参数、无源码改动再编译：**45s**，781 tasks，18 executed、763 up-to-date；`buildRustArm64`、`createBundleReleaseJsAndAssets`、`minifyReleaseWithR8`均UP-TO-DATE。CMake任务仍被调用，但利用既有编译产物；不能把所有18项executed解释为完整重编。
- 两轮交付 APK SHA256均为 `9eb81dabe199f76c4177d9fea7e64c29adae36f5f7a38f24adc981c84002021f`，88,898,958 bytes。两轮 ZIP CRC、仅arm64 ABI、aapt2、apksigner、16KB zipalign及复制件hash/CRC全部通过；包内终端HTML与生成资产一致。
- Rust临时库与项目storage副本SHA256一致：`3bf1c5934291e24862b1f0afa45e02ab2f574b04efa8d05c751a04ea7e0245c7`。
- 保留增量用途缓存：Gradle约3.3GiB、Rust约1.8GiB。已有其他任务的`/dev/shm/whip-build/cargo-target`未修改或删除。编译日志在结果归档后删除；生成绑定按生成器输出保留，以免破坏输出指纹和增量判断。生成器的既有新增C++行末空白仍会被`git diff --check`指出，未为格式问题改变本轮已编译源码。
- **45s仅代表无源码变化的重编**。后续修改JS仍需Metro/Hermes与打包；修改Rust仍需相关crate优化与原生链接；依赖或Java/Kotlin变更可能需R8。此次只完成构建与产物校验，没有实机功能验收。
