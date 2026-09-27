# Android E-Ink Release 构建与安装验证

日期：2026-09-27。执行：GPT-6 Sol medium；主代理审核源码后冻结并授权构建。最终实机性能复测由独立报告记录，本报告不证明续航收益。

## 最终集成检查

- Jest：12 suites、91 tests 全通过。覆盖 terminalRendererHost、sessionConnectionLifecycle、liveHostMonitoring、useAgentNotificationSideEffects、terminalRestoreCancellation、performanceTrace、performanceDiagnostics、runtimeProjectionScheduler、terminalBatchScheduler、terminalWebDiagnostics、terminalAssets、terminalAssetGeneration。
- `tsc --noEmit` 通过；`node scripts/sync-terminal-assets.mjs --check` 通过。
- 10 个本轮改动生产 TS/TSX 文件定向 ESLint（max-warnings 0、report-unused-disable-directives）通过。
- 生成器脚本 ESLint 被既有 parser 对第 53 行 dynamic import 的支持限制阻断；未扩大全仓 lint 范围。生成器由资产一致性与 Jest 验证覆盖。
- 最终 Rust 测试由实现 worker 执行并主代理审核：31 + 88 + 15 tests 通过，本执行者未无理由重复运行。

## 构建环境与结果

- SDK：`/home/ubuntu/Android/Sdk`；`ANDROID_HOME`、`ANDROID_SDK_ROOT` 同值；`EXPO_NO_DOTENV=1`。
- 架构仅 `arm64-v8a`；Gradle `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a -Pwhip.previewSigning=true --max-workers=4`，未设置 skipR8；日志确认 `minifyReleaseWithR8`、资源压缩与优化正常执行。
- `WHIP_BUILD_ROOT=/dev/shm/whip-release-20260927`，`CARGO_TARGET_DIR` 指向其 rust-target 子目录。Gradle init script 对所有项目与 included plugin builds 重定向 buildDirectory，并在 projectsEvaluated 断言目录未逃逸。
- 首次配置失败：RN settings 插件把 autolinking.json 写入固定 android/build，app 按重定向目录读取而找不到。只修临时 init script，将 settings 已生成 JSON 复制到 tmpfs root buildDirectory；无生产代码改动。JSON 非归档。
- 重试正常完成：`BUILD SUCCESSFUL in 20m 4s`，781 tasks：652 executed、129 up-to-date。第三方 deprecated API、YAML scanner 及 Amazon appstore R8 stack-map warnings 未阻止构建。
- Rust aarch64 optimized build 完成（5m51s），ubrn 随后生成相同 API 绑定。tmpfs 最新 `.a` 与 install 到项目 storage 的副本 SHA256 均为 `990854374ddfe210ed46e69789ab972954188583aedc773c3b6f5e40fa80eaa9`；llvm-ar 枚举 614 成员通过。
- 生成器加入的 7 处新增 C++ 行尾空白在编译结束后按主代理要求规范化；无语义变化，不重新编译 APK。`git diff --check` 通过。

## APK 完整性与身份

产物：`android/app/build/outputs/apk/release/app-release.apk`，88,898,446 bytes。

SHA256：`fe153850af68df4ef5a6009ee0861735b64d9582475899905daacda4c2237115`。

- tmpfs APK ZIP CRC 全检查通过（1456 entries）；native `.so` ABI 集合严格为 arm64-v8a。
- aapt2 badging / manifest 解析通过：`io.github.kaminarios.whip`，versionName 1.7.0、versionCode 245、minSdk 24、targetSdk 36。
- manifest 未声明 debuggable 或 profileable，均默认 false；badging 无 application-debuggable。
- apksigner verify 通过，v2 signature有效；signer cert SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。
- `zipalign -c -P 16 4` 通过。
- 通过上述检查后复制到正常输出路径，复制件重新验证 SHA256 与 ZIP CRC，相同且通过。

## 覆盖安装与启动

设备：`BA51B0H2FK7A007000047`。与基线代理协调后执行安装，无卸载、无清应用数据。

- 已装旧包拉取副本 SHA256：`1df449b9d4f53b3250627f9546ee2cbd2086e900f58535b40c77fea0299d0ba2`。旧包同为1.7.0(245)、arm64-v8a，manifest未声明debuggable/profileable；其源码 commit 未核实，不能因版本相同称为相同源码基线。
- 旧包与新包 signer cert SHA256 一致，允许 `adb install -r`，结果 `Success`。
- 安装后设备 base.apk SHA256 与交付件完全一致 `fe153850…`；dumpsys package确认1.7.0(245)、primaryCpuAbi arm64-v8a，pkgFlags不含 DEBUGGABLE。
- MainActivity 启动成功，PID 2040 持续存在；启动短观察中该 PID crash buffer fatal markers 为0。这是启动检查，不代表全部功能场景均已实测。
- ADB已交回独立性能复测代理，未自行执行负载或改变设备设置。最终设置恢复由 terminal 复测执行者负责，恢复 stay_on 原值0。

## 留存与清理

最终实机复测已由主代理确认无回退：归一化连续输出 CPU 降46.88%；软件 input→doubleRAF 20样本 p95 为88.432ms，旧包118.960ms。这些是本轮短测，不能直接换算面板功耗或续航。

交付APK与本报告保留，并在清理前再验 hash/CRC。本执行者已核实 `/dev/shm/whip-release-20260927` 为本轮持有目录、非符号链接、无活跃构建进程引用，然后精确删除该目录（含旧回滚APK、本轮日志和中间文件）；未删除共享缓存或其他代理文件。其他代理持有的 `/dev/shm/whip-replay-command.txt` 与 `/dev/shm/whip-old-input-samples.json` 不属于本执行者清理范围。
