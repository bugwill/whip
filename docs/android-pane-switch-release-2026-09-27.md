# Android pane 切换修复 Release 验证

日期：2026-09-27。执行：GPT-6 Sol medium，主代理已审核生产修复。实机 pane 对照由 terminal 代理独立执行，结果另见最终实测报告。

## 范围与检查

本轮生产变化：TerminalRendererHost 对已释放 E-Ink controller entry 提前返回；生成器按稳定 measurementSignature 与终端尺寸复用有效几何测量，仍在字体、cell、padding、scrollbar、DPR或实际尺寸变化时重新测量。构建执行者未改变生产行为。

- 指定 5 套 Jest（terminalRendererHost、terminalFitGeometry、terminalAssets、terminalAssetGeneration、terminalRestoreCancellation）64/64 通过。
- 额外 terminalResize 与 Geometry 组合43/43通过；Geometry3已在上述64中，唯一总数为 **6 suites、104 tests**。
- terminalResize 老 DOM fixture 缺少 ownerDocument/createElementNS/setAttribute/appendChild，运行已有 contrast 初始化时异常。按主代理授权最小补齐共享 document/defaultView 及 DOM mock，未修改生产。实际 FitAddon 的 Android/iOS40测试随后通过。
- 最终 tsc --noEmit、生产 TerminalRendererHost/新增Geometry/修复Resize fixture 定向 ESLint（零warning）及 assets --check 通过，git diff --check 通过。
- 扩大 lint 至既有 terminalRendererHost 测试时，874行延迟await assertion被既有规则警告；该异步assertion后续有await。本轮未为此扩大修改范围。

## 构建

- `ANDROID_HOME`/`ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk`，`EXPO_NO_DOTENV=1`；仅 arm64-v8a、previewSigning=true，正常 R8/资源压缩。
- 独立 tmpfs 根 `/dev/shm/whip-pane-release-20260927`，临时 init 对所有 Gradle项目及 included plugin builds 重定向 buildDirectory，projectsEvaluated 断言无逃逸；固定位置 settings autolinking JSON复制到重定向root，归档全部在tmpfs。
- Rust/绑定本轮未编辑，经主代理明确确认；已验证静态.a SHA256严格等于上轮 `990854374ddfe210ed46e69789ab972954188583aedc773c3b6f5e40fa80eaa9`，精确 `-x :react-native-whip-ssh:buildRustArm64`复用，未重跑无变化Rust测试。
- 首次exec客户端意外SIGTERM/exit143；daemon日志明确client disconnection导致取消buildSrc:compileGroovy。核实任务已结束、daemon空闲，无OOM后同目录增量重试，无并行重复任务。
- 重试正常成功：**15m45s**；780 tasks，671 executed、109 up-to-date。日志明确minifyReleaseWithR8/资源压缩/优化。
- 长期daemon提示512MiB metaspace高将build结束停；有限GC采样2秒FGC不变、GCT只增0.083s，CPU/有限vmstat确认继续优化，未因慢跳过R8或重启。Amazon SDK stack-map与第三方deprecation warnings未阻断结果。

## APK 与安装

交付：`android/app/build/outputs/apk/release/app-release.apk`，88,898,674 bytes。

SHA256：`cb665fc77d60314818d42f9bc9b3504246ef0b935df4b6e8fdf17f04788301b7`。

- ZIP CRC检查1456 entries通过；native ABI集合严格arm64-v8a。
- aapt2 badging/manifest解析通过：io.github.kaminarios.whip、1.7.0(245)、minSdk24/targetSdk36；debuggable/profileable均未声明默认false。
- apksigner有效v2签名，证书SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 与已装旧包一致；zipalign `-c -P 16 4`通过。
- 四项验证后复制正常输出路径，复制件hash与CRC再验通过。
- 旧APK独立回滚副本已先保留，SHA256 `fe153850af68df4ef5a6009ee0861735b64d9582475899905daacda4c2237115`。
- 协调ADB交接后覆盖install-r成功，无卸载/清数据；设备base.apk完整SHA256与交付件相同，dumpsys确认arm64与版本、无DEBUGGABLE。
- MainActivity启动PID21218，该PID crash buffer fatal markers0。ADB已交terminal进行相同pane负载新版本复测，构建执行者不施加额外负载/改设备设置。

## 留存与清理状态

主代理确认最终实测通过：3轮 pane 切换总体CPU新65.12%、旧118.81%，观察降45.19%；这不是电量或续航结论。主代理视觉复核A/B/C各自提示符与选中pane一致，无空白或错pane，C有READY回显。

交付APK与此报告保留；清理前再次验证交付hash/CRC通过。本执行者已核实owned `/dev/shm/whip-pane-release-20260927` 为精确本轮目录、非symlink、同UID、无活跃构建/cwd引用，并删除其rollback/log/intermediates。其他代理workspace、样本/测试脚本及共享缓存未删除。未操作ADB。
