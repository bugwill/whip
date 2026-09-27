# Android E-Ink 本轮实施与审核记录

依据：`android-eink-power-review-and-execution-2026-09-27.md`。执行模型：测试、实现、最终定稿/构建及复核均委派 GPT-6 Sol medium；主代理负责方案与代码审核。

## 基线与范围决定

- 修改前四组 Jest：terminalRendererHost、sessionConnectionLifecycle、liveHostMonitoring、useAgentNotificationSideEffects，54/54 通过。
- ADB 设备已连接，Android 14，已装 Whip 1.7.0 (245)，WebView beta 155.0.8059.16。
- USB 正在充电，电荷计数可读。现有进程的短观察不能证明实际节电比例；详细时序由独立实测报告记录。
- 初始基线遵守当时的 SSH 间接访问禁令，没有恢复连接。随后用户明确允许通过已配置的 SSH 认证执行命令（例如 `ssh ubuntu`），条件是不读取或输出密钥内容；后续验证遵循这条最新授权。仍不直接访问密钥文件或读取应用敏感存储。

## 本轮修改

1. 默认关闭的内存聚合计数，诊断关闭不新增周期 timer、磁盘写入或 React 提交；结束场景导出。
2. 后台自动 UI 投影门控：在 `view()` 前门控，逐事件通知保留；active 恢复刷新最新 Rust 权威状态，显式操作清 dirty 并即时生效。审计连接、终端、错误与通知导航旁路，不新增 JS 权威 host 状态。
3. E-Ink 终端 250/500ms 自适应批处理，覆盖 plain SSH UTF-8 两条路径；输入、首次响应、baseline、resize/recovery 保留快通道；容量、ANSI 顺序与销毁清理保持正确。
4. E-Ink OpenCode 无变化退避至 10s，发送/状态变化/consumer恢复/重连可靠唤醒；不影响 normal 策略，不允许旧任务复活。
5. 复用现有 monitoring worker：E-Ink Hosts 60s 探测；fresh、事件订阅有效的后台对账 300s；前台 120s；恢复和缺口明确强制对账，避免重复探测和空转。

## 暂不捆绑的修改

- SSH keepalive/timeout（PR4B）：先具备空闲、断网及恢复的受控实测条件，保留当前策略。
- WakeLock 删除、隐藏 SSH 背压、WebView 字节流合并：尚无足够归因证据，保留现有行为。
- 前台全局投影合并、显示设备识别及动画：无本轮测量支持，不顺带改动。

## 发布门槛

- 主代理审核关键边界与对应测试，再委派 Sol medium 定稿。
- Release 仅 arm64-v8a，设置指定 SDK、`EXPO_NO_DOTENV=1`，临时 ext4/tmpfs 构建目录；Rust、Gradle 归档也不得直接构建到 `/Documents`。
- APK ZIP CRC、aapt2、apksigner、zipalign 全部通过后复制到正常输出目录，复验复制件；ADB 安装并核对包身份/版本/产物一致性。
- 最终实机功能和耗电检查分别记录，不能从 CPU、包数或 timer 减少推算面板功率或续航百分比。缺少受控未充电三轮对照时明确未验证。
- 清理本轮不再需要的临时文件，保留产物和必要证据，不删除共享缓存或他人文件。

## 状态

主代理已完成源码审核，代码冻结并交 GPT-6 Sol medium 最终定稿/构建。最终集成：12 套 Jest 共 91 项通过；Rust agent_sessions 31、host_runtime 88、herdr_events 15 项以默认并行模式通过；TypeScript、定向 TS/TSX ESLint、终端资产同步校验通过。生成器全文件 ESLint 遇已有动态 import parser 限制，采用对应 Jest 与资产校验，未为消除无关 lint 修改代码。

审核发现并已修复：前台 terminal mutation 返回视图重复拉取、恢复时 stateRef 同步性、诊断结束 ACK 与新场景竞态、无效事件订阅误判健康、建立期间断开的迟到成功，以及旧订阅清理误关替代/借用流。新增测试覆盖这些边界。

正常 R8 Release 已构建并覆盖安装：`android/app/build/outputs/apk/release/app-release.apk`，SHA256 `fe153850af68df4ef5a6009ee0861735b64d9582475899905daacda4c2237115`。临时产物经过 ZIP CRC、aapt2、apksigner、16KB zipalign 验证，复制件及设备已装 `base.apk` 哈希一致。仅 arm64-v8a，1.7.0 (245)，非 debuggable。主代理另核对 APK 内 `assets/herdr-terminal.html` 包含新的场景 generation 和收集 ACK 逻辑。

本轮已完成：GPT-6 Sol medium 完成最终源码、安装与实机复核，完整原始数字与限制见 [最终验证报告](android-eink-final-verification-2026-09-27.md)。主代理已读取报告并独立重算数字。终端稳态按各自时长归一化后，应用与 WebView 合计 CPU 由约 83.01% 单核降至 44.09%（本轮观察下降约 46.88%）；新旧可视区域未严格对齐，且真实 agent 并发，因此不能据此证明严格同条件下的因果优化幅度，更不能换算节电比例。20 次输入软件 trace 的 p95 从 118.960ms 降至 88.432ms，不包含物理墨水屏刷新。

测试工作区已确认唯一名称后关闭；输入法恢复 `com.tencent.wetype/.plugin.hld.WxHldService`，`stay_on_while_plugged_in` 恢复原值 `0`，atrace 已停止。主代理接回 ADB 后再次读取输入法和 stay_on，两者均与原值一致。构建代理已核实并清理本轮 tmpfs 构建目录及旧包副本；正常输出 APK 保留并再次通过哈希与 CRC 校验。测试临时 trace、截图和命令已清理，脱敏数字留存在报告中。

真实续航仍未验证：用户已选择先完成可测验证并明确记录数据缺口。本次 USB 充电、单轮对照及视口差异不能提供可靠节电百分比；未完成的 Chat/通知/网络切换等设备场景详见最终报告，不将单元测试或局部观察冒充实机验收。

### 后续 pane 切换修复与安装

用户追加 pane 切换修复并要求安装、测试，已完成。已释放的 E-Ink pane 不再重复快照/重置；稳定几何复用 FitAddon 尺寸结果，布局/字体/cell/padding/scrollbar/DPR 变化仍重新计算，延迟布局检查与完整画面恢复保留。既有 terminalResize 测试 DOM fixture 补齐 contrast 所需接口，6 套唯一 104 项通过，TypeScript、定向 lint、资产校验及 diff 检查通过。

正常 R8、仅 arm64 的新版 Release 已覆盖安装，当前正常输出 APK SHA256 为 `cb665fc77d60314818d42f9bc9b3504246ef0b935df4b6e8fdf17f04788301b7`，替代上文初轮产物；四项校验通过、设备哈希一致。主代理另验复制件 CRC 与包内新终端资产。构建与安装证据见 [pane Release 报告](android-pane-switch-release-2026-09-27.md)。

旧/新各三轮 60 秒，三个空闲 pane 按固定脚本每 2 秒切换、视口一致。合计 App+WebView CPU 率观察为 118.81%→65.12% 单核（下降约 45.19%），不能当作节电比例或严格因果收益；并行真实 agents、顺序采样和温度仍有混杂。CPU 结束后独立提示符验证 A/B/C 身份恢复，主代理视觉复核无空白/错 pane。原始数值与限制见 [pane 实测报告](android-pane-switch-verification-2026-09-27.md)。测试工作区和临时构建/测试文件已清理，主代理接回 ADB 后确认输入法恢复、stay_on=0。

### 已实现的手动场景诊断入口（本轮）

应用 runtime manager 初始化时注册 Rust 诊断适配器。可以在能够访问应用 JS `globalThis` 的开发调试控制台中手动执行：

```js
globalThis.__whipPerformanceDiagnostics.begin();
// 完成测试场景后；end 会先等待已注册 renderer 的最后一次收集。
const snapshot = await globalThis.__whipPerformanceDiagnostics.end();
```

`begin` 清空并开启 JS/Rust 内存计数；`end` 等待 renderer collector、关闭收集，然后返回 JS counters/durations/gauges 及 `native` Rust 快照。先等待 `end` 完成，再开始下一场景。JS 每类指标最多 256 个名称，诊断默认关闭，无常驻 timer、逐事件日志、磁盘写入或 React UI。collector 的导出等待可使用一次性超时；失败记为 `diagnostics.collectorFailures`，不意味着完整取得所有 WebView 数据。

该全局入口也存在于 Release JS，但普通 Release 安装不会因此提供可操作的控制台或自动导出文件；必须另有可访问 JS 调试上下文，并安装包含新增 Rust FFI 的匹配原生构建。本轮只完成代码与自动验证，未声称已经在设备上启用或导出 Release 诊断。

runtime.view 目前统计调度器实际调用的自动 `AppCore.view()`，runtime.projection 统计实际提交并区分前后台；显式操作中的直接 `view()` 不纳入该自动计数。终端 lifecycle 的既有 Rust mutation API 返回全量投影：前台复用此返回值，后台不保留它且仅标 dirty，因此没有额外 `view()` 或 UI 提交，但此 mutation 内部的 Rust 投影成本尚未消除。停止后台自动投影不等于所有业务/FFI工作都为零。
