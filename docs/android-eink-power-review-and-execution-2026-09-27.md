# Android 墨水屏功耗方案复核与执行清单

日期：2026-09-27。基于当前工作区源码及官方资料复核；未做真机功耗测量，下面的参数是首轮实验值，不是已验证的节电比例。

## 1. 结论

原文 `android-eink-power-plan-2026-09-27.md` 的方向靠谱：减少不可见工作、合并终端输出、降低空闲轮询都有明确代码依据。但它还不是可以逐条照做的实施规格。P3 的网络模型、P5 的动画排查、P1 的直连 SSH 修改范围，以及锁屏路径的确定性，需要修正。

建议执行顺序：低开销计数 → 后台投影调度 → 终端批处理 → OpenCode 空闲退避 → 网络策略。保留现有断锁屏连接策略；推送架构另立任务。

本次覆盖：React Native 生命周期、通知、终端/WebView 源模板、Chat 消费订阅、Rust host monitoring / OpenCode 同步 / AppCore、Android 前台服务与锁屏事件、缓存及动画热点。不是逐行审计所有业务代码，也未连接远端或读取任何 SSH 密钥。

## 2. 原文哪些成立，哪些需要改

| 项目 | 复核结论及依据 |
| --- | --- |
| P1：终端合并 | 成立。`src/components/TerminalRendererHost.tsx:92` 是 100ms；`:389` 排除 SSH。但这只是注入调度窗口，不是面板实际刷新率上限。容量冲刷、输入、完整帧都能绕过窗口。 |
| P2：后台投影 | 成立。`useSessionConnectionLifecycle.ts:277` 的每次 host-state 处理都会取 `AppCore.view()`；`useSessionRuntimeManager.ts:216` 又投影所有 host、terminal 并提交 React 状态。`startTransition` 不会免掉同步 FFI/投影工作。 |
| P3：四个独立计时器 | 不准确。`host_runtime/monitoring.rs:135` 起已经在同一 worker 中调度 health、visible latency、reconcile；health 与 latency 同时到期只调用一次 `probe()`。仍有优化空间，但不能把次数直接相加。 |
| P3：每分钟固定四次 keepalive | 不准确。锁定的 russh 为 0.63.1；官方说明是未收到服务器数据达到间隔才发 keepalive。有入站流量时不是固定四次。[russh 配置](https://docs.rs/russh/0.63.1/russh/client/struct.Config.html) |
| P3：恢复时 `force_probe` 已能强制对账 | 不准确。它强制探测；只有对账到期、需要 resync 或状态非 fresh 时才完整对账。必须单独加入恢复对账条件。 |
| P4：OpenCode 空闲轮询 | 成立。`agent_sessions.rs:1240` 执行 cursor 查询，未变化仍在 `:1484` 安排下一次；1.2s 是查询完成后的等待，不是严格每秒固定请求率。 |
| P5：残留动画 | 列举点基本已处理：About/app-ui 直接赋终值；Settings 使用条件分支；OverlayScrollbar/TerminalScreen 的 reduced-motion 时长为 0。没有证据支持为了节电统一重写这些调用。 |
| 锁屏完全断开、已最优 | 代码意图成立，但不应写成已实测保证。原生 `HerdrBackgroundModule.kt:348` 先停提醒和服务，再发事件；runtime 销毁在 JS 的 `pauseForDeviceLock()`。若 JS 被挂起，实际关闭时机仍需观察。 |
| E-Ink 只保留当前终端连接 | 要加限定：这是 Herdr renderer/controller 策略；plain SSH 在释放、隐藏帧过滤等路径被排除。不是所有 SSH 都如此。 |
| P6：WakeLock 无效 | 普通 interactive 状态下可能冗余，但不能仅凭“屏上还有画面”断言。墨水屏能保持图像；Android `isInteractive()` 也不是面板/前光开关。先测服务和锁状态，再决定删锁。[Android API](https://developer.android.com/reference/android/os/PowerManager#isInteractive()) |

另外三点物理假设不宜当结论：

- E Ink 双稳态说明保持图像不需面板驱动功率，不代表整个平板静止时不耗电。[E Ink 技术说明](https://www.eink.com/tech/detail/Benefits)
- 不能从一次 `injectJavaScript` 推导一次面板刷新；还隔着 xterm、浏览器绘制、合成器及厂商刷新策略。
- “局刷必需 100–300ms”“前光必定最大耗电”“A2 一定更费电”应改为设备相关假设。Wi-Fi 包数也不等于射频唤醒次数，不能直接套用蜂窝网络尾耗模型。

## 3. 第一批：可立即开始的四个独立修改

### PR 0：建立可对比的计数，避免凭体感优化

修改 `src/services/performanceTrace.ts` 及以下调用点，新增受诊断开关控制的内存计数；结束场景时导出一次，不逐事件写日志、持久化或驱动 UI。

- `TerminalRendererHost`：接收帧数/字节数、实际注入次数、每批字节/写入数、冲刷原因、最老等待时间。
- `useSessionConnectionLifecycle` / `useSessionRuntimeManager`：host-state 数、`view()` 调用数和耗时、实际投影提交数，区分前后台。
- Rust monitoring：health/latency probe、reconcile、失败和重连次数。
- OpenCode：cursor 查询次数、未变化次数、查询耗时、消息可见延迟。
- WebView：xterm write 次数与完成耗时；诊断期间可增加未完成写入字节数。

不要直接以现有逐帧 trace slice 数充当注入次数：合并后同一次注入仍可包含多个 frame cookie。当前 `performanceTrace.ts` 也没有可直接使用的 `commitAppCore` 专用计数。

验收：关闭诊断后不增加周期性 timer；静止时计数器本身不产生 React 提交或磁盘写入。先保留短基线，不必等待数小时功耗实验才开始改代码。

### PR 1：后台停止自动 UI 投影，保留通知和运行时工作

范围：`src/hooks/useSessionConnectionLifecycle.ts`、`useSessionRuntimeManager.ts`、`useLiveHostMonitoring.ts`；必要时抽一个纯调度器到 `src/lib/`。

1. 提供 `requestRuntimeProjection()`，将自动事件触发的 `appCore.view()` 放进调度器内部。后台只置 dirty，不能先调用 `view()` 再决定不提交。
2. 每个 agent transition 仍立即交给通知逻辑，不合并、不丢弃中间状态。Rust 仍是权威状态所有者。
3. 检查所有自动提交入口，包括 connection-state、恢复、错误、latency；只拦 `acceptHostState` 会留下旁路。
4. 恢复 active 时合并提交一次最新本地权威视图；在通知跳转和依赖 stateRef 的恢复逻辑前完成必要刷新。不要放入 `startTransition`，但也不要承诺 React 一定在监听器返回前完成渲染。
5. 用户切换/创建/关闭、锁屏清理等显式操作立即生效。显式提交若已包含 dirty 变化，应清除 dirty，避免多交一次。
6. 首个 PR 只做后台门控。若计数证实前台状态更新密集，再加 E-Ink 的 250ms 合并及 500ms 最大等待；使用有最大等待的调度，避免持续事件把尾部 debounce 无限推迟。

**重要约束：** 当前 `stateRef.current` 被连接生命周期及通知点击解析使用。不能把所有更新一刀切冻结；逐个确认这些路径取 Rust/运行时最新状态，或在需要时立即刷新。不要新增一套 JS 权威 host 状态。

测试扩展 `__tests__/sessionConnectionLifecycle.test.tsx`、`liveHostMonitoring.test.tsx`、`useAgentNotificationSideEffects.test.tsx`：后台连续事件仍产生正确通知，自动 `view()`/投影为零；恢复只提交最新一次；通知点击、断线重连、快速前后台切换和锁屏不读到失效 runtime。

### PR 2：终端以 250/500ms 自适应批处理，保留交互快通道

范围：`src/components/TerminalRendererHost.tsx`；调度规则可提取为纯函数，扩展 `__tests__/terminalRendererHost.test.tsx`。

首轮参数：

| 情况 | 建议策略 |
| --- | --- |
| 被动输出开始 | 从首个待处理写入起最多等 250ms |
| 连续输出达到 2s | 提高至 500ms；先不默认 1000ms |
| 1s 未收到新输出 | 下次回到 250ms；用到达时间判断，无需新增常驻轮询 |
| 输入后 500ms | 立即发送 |
| 等待首次远端响应 | 保留现有最多 5s 的等待标记；收到响应后恢复 500ms 交互窗口 |
| 首次显示、完整基线、resize/recovery | 保留立即处理及先前队列顺序 |
| 达到 64KiB 或 32 个待处理写入 | 立即冲刷；容量上限不是吞吐背压 |

直连 SSH 必须同时修改三处，否则批处理不会真正生效：

1. `dispatchFrameScript()` 的 `canBatch` 去掉 SSH 排除。
2. `markEinkImmediate()` 去掉 SSH 排除，使真实用户输入能开启快通道。
3. `injectFrame()` 两个 UTF-8 分支当前把 `immediate=true` 写死；改为依据输入、恢复等语义决定。

计时使用单调时钟；保持 profile 切换、销毁、切换 pane 的队列清理和顺序。`full`、`seq`、`final` 语义不变，增量 ANSI 不允许随意丢帧。

**不要混淆收益：** 当前 flush 只是把多个 JS 调用拼成一次注入；`scripts/sync-terminal-assets.mjs:795` 起每次调用仍各自解码并 `terminal.write()`。所以先验收桥接次数和延迟；若 WebView CPU 没下降，再考虑在生成器源模板中合并解码后的相邻字节流，保留 reset/帧边界及 trace 回调。不能简单连接带 padding 的独立 Base64 字符串。

验收：低于容量阈值的连续被动输出，稳定后定时冲刷约 2 次/秒；阈值/基线/交互冲刷单独统计。确定性单测确认输入/首个回显不增加批处理等待，真机比较输入 p95。覆盖 SSH 的 string/ArrayBuffer、ANSI 分片、全屏 TUI、profile 切换、队列压力、卸载后无残余 timer。

### PR 3：OpenCode 无变化时退避，但保留兜底轮询

范围：`packages/react-native-whip-ssh/rust/src/agent_sessions.rs`、必要的 `host_runtime/agents.rs` 唤醒桥接。

1. 每个会话记录空轮询次数，E-Ink 首轮采用 1.2 → 2.4 → 5 → 10s；有变化归零。先保留普通屏原策略，之后按交互数据决定是否推广。
2. 用户发送、该会话 agent 状态变化、consumer 重新激活、连接恢复时立即唤醒；仅改“下次间隔”不够，必须能中断当前较长 sleep。
3. 沿用 `operation_epoch`、`sync_generation` 和 consumer 有效性检查。确保每会话最多一个同步操作，旧 timer 和旧响应不能重启已关闭会话。
4. idle/done 仍以 10s 兜底，不首批实现“仅靠事件、彻底停轮询”。状态与转录最后写盘时序未被证明同步，完全暂停可能漏最后一段输出或远端新消息。
5. 只有 E-Ink 可见、已打开 Chat 的 consumer 活跃；保留现有暂停路径，不新增重复控制器。

验收：稳定空闲后约不超过 6 次 cursor 查询/分钟（不含唤醒，执行耗时会降低频率）；变化重置、无事件时兜底可见；发送唤醒不等 10s。无唤醒的最坏延迟为当前退避周期加查询/处理时间，须记录，而不是承诺即时。

## 4. 第二批：网络策略，拆成两个改动

### PR 4A：先利用已有 monitoring worker

修改 `host_runtime/monitoring.rs`：

- E-Ink Hosts 可见延迟探测从 15s 调为 60s，与已有 60s health 尽量共用一次 probe。进 Hosts 仍立即获取一次。
- 新增明确的 `force_reconcile`：回到前台、事件流恢复、已知缺口时触发；不要复用含义不同的 `force_probe`。
- 前台 reconcile 保持 120s。后台且事件订阅有效、fresh、无缺口时先放宽至 300s，验证漏事件恢复延迟后再考虑 600s。
- stale/resync/错误仍立即修复；同轮已成功做了控制快照时可复用该次成功作为相应服务层活性证据，减少重复探测。
- 周期的整数倍本身不保证同相位。只在现有 worker 内用共同 deadline/已完成工作合并；不另造一套独立调度器。

单测需覆盖：health 与 latency 同时到期只探测一次；fresh 回前台仍对账一次；事件缺口不等 300s；后台不做可见延迟探测；切换状态不会产生空转循环。

### PR 4B：再调整 SSH keepalive 与功耗设置

范围：`ssh/mod.rs`、`host_runtime/connection.rs`、监控/连接配置 FFI、`useLiveHostMonitoring.ts`、设置文案和测试。

- 可先试 Balanced 45s、Realtime 15s；同步调整并验证 inactivity timeout。不能保留 30s inactivity 然后盲目把 keepalive 改为 60s。
- 区分连接超时、SSH 空闲超时、请求超时及业务探测超时；`interval × max` 只可作粗略估计，不能作为端到端恢复时间保证。
- keepalive 是 SSH 传输层活性，不证明 Herdr 控制服务、事件订阅或转录通道正常。因此不接受“后台完全交给 keepalive”的建议；保留较低频服务层探测/对账。
- “最近有入站流量”必须按通道/证据分类：终端有输出不证明控制通道正常；某个 host 的流量更不能替其他 host 证明活性。
- russh 连接配置在建立时传入。首版可规定模式变化在下次连接生效，并明确 UI 文案；不要为切换省电模式主动中断用户 SSH 会话。若要热更新，单独设计连接内策略。
- 保留 Realtime 作为可靠性回退。用同一网络的空闲、断网、恢复和网络切换场景比较重连次数，而不是只看包数。

WakeLock 删除不与上述变更捆绑。原生服务/锁屏实测通过后另做小改动，便于发现厂商电源管理差异。

## 5. 原文漏掉的优化和已有成果

### 5.1 隐藏的 plain SSH 终端仍可能持续消费输出

`TerminalRendererHost.tsx:683` 的非活动帧过滤、`:457` 的释放控制器、`:1403` 的后台释放都豁免 SSH；现有 `background keeps plain SSH attached` 测试也确认保留连接。这说明“只处理当前终端”并不适用于整个程序。

建议单独计数“不可见 SSH 字节、xterm 写入、CPU”，将其列为下一项候选。不要直接丢原始 ANSI，也不要套用 Herdr 断开再完整快照恢复：plain SSH 没有等价的服务端恢复保证。

若证实热点，再设计保留会话的有界字节队列/解析状态与背压；必须说明缓冲满后对远端 PTY 的影响。暂停读取可能阻塞远端程序，不应默认全局启用。xterm 官方也强调大量写入需要端到端流控，而非无限排队。[xterm Flowcontrol](https://xtermjs.org/docs/guides/flowcontrol/)

### 5.2 FFI 重复全量投影可以进一步减少

当前 host-state 事件已经带状态，随后 `AppCore.view()` 又拉所有 session；`AppSession::view()` 构建各 host 投影。这是 P2 之外的放大成本，多 host 时更值得测量。

先做全局合并，后续才按 host revision 缓存投影/结构共享或新增轻量投影 API。需要包含连接、选择、terminal rail 等相关 revision，不能只按 AppCore 顶层 revision 去重就假定 host 内容没变。Rust 保持唯一真相，避免 JS 自行重建业务状态。

### 5.3 E-Ink 自动识别有误判风险

`src/lib/displayProfile.tsx` 将 manufacturer/model/fingerprint 等拼接后做子串匹配，包含宽泛的 `ink`、`hisense`。品牌不等于所有机型都是电子纸。

可新增正反样本测试，逐步用已知型号/品牌与型号组合替代宽泛匹配；显式 `eink`/`normal` 设置继续优先。这是策略正确性改进，不计为直接节电收益。

### 5.4 已经做好的部分无需重做

- `scripts/terminal-offline-cache.cjs` 已有 E-Ink 至少 3s 静默、30s 最小空闲快照间隔、500 行序列化上限、相同内容去重。不要再把它当成每 750ms 持续全量序列化的漏洞。
- Chat 已使用 FlashList 和 memo/useMemo；E-Ink 消费订阅已按 active/visible/用户打开状态暂停。没有数据支持现在重写整个 Chat 列表。
- 动画基本已受 reduced-motion 策略管理；已有 disabled trace 低开销路径。首轮不做统一动画框架或全局 memo 清理。
- 把 xterm 缓存由 3 降到 1 可能增加重建和重连成本，不宜凭“少驻留更省电”直接改。

## 6. 测量、测试与发布门槛

### 工作负载

使用相同设备、同一应用版本配置、相同 host/pane 数、固定前光和厂商刷新模式；记录 Android/WebView 版本。先做 3–5 分钟性能回放，再对关键场景重复至少三轮 20–30 分钟功耗对照；交错旧/新顺序，记录温度、信号和电池范围。

| 场景 | 主要验收 |
| --- | --- |
| 前台 Herdr 连续输出 | 内容一致、注入/CPU 降低、输入 p95 不显著回退 |
| 前台静止 Herd / Hosts | 无多余 UI 提交，探测请求次数符合策略 |
| 亮屏切去阅读器、通知开启 | 自动全量投影为零，通知无遗漏/重复 |
| OpenCode Chat 空闲→发消息→完成 | 空闲查询下降、唤醒立即、最后输出最终可见 |
| plain SSH 可见/隐藏、大量输出/TUI | 字节不丢、不乱序、无持续内存增长 |
| 锁屏/解锁/网络切换 | 服务与 wake lock 释放；记录最后包与 runtime 销毁时刻；恢复后对账正确 |

`batterystats` 是辅助证据，不能从 CPU 时间、alarm 或包数直接推算面板功率。Android 官方提示 Battery Historian 已不积极维护，更适合搭配系统 tracing、Power Profiler；是否有功率轨数据取决于设备。[Android 测量说明](https://developer.android.com/topic/performance/power/setup-battery-historian)、[Power Profiler](https://developer.android.com/studio/profile/power-profiler)

墨水屏设备无功率轨时，使用电量计/电荷计数差值或可用的外部测量；记录充电状态。无线 ADB 会引入网络流量，USB 充电也影响电池对照，采集方式必须一致。完整 trace、逐包抓取和“显示界面更新”只用于诊断，不作为最终低扰动功耗测试配置。

### 自动验证

按每个 PR 的改动运行对应 Jest/Rust 单测，避免第一批就编译 APK。新增测试优先验证顺序、取消、恢复和通知等行为；文档本身无需新增测试。

示例（按实际新增测试名称调整）：

```bash
npm test -- --runInBand __tests__/terminalRendererHost.test.tsx __tests__/sessionConnectionLifecycle.test.tsx __tests__/liveHostMonitoring.test.tsx __tests__/useAgentNotificationSideEffects.test.tsx
```

修改 WebView 逻辑时编辑 `scripts/sync-terminal-assets.mjs` 或其引用的源模块，再同步并校验 Android/iOS 生成资产，不手改生成 HTML。Rust/FFI 变更应使用仓库既有绑定生成和验证流程。

需要真机包时遵守 AGENTS：`ANDROID_HOME`/`ANDROID_SDK_ROOT` 指向指定 SDK；`EXPO_NO_DOTENV=1`；只构建 `-PreactNativeArchitectures=arm64-v8a`。将构建输出重定向 tmpfs/ext4，完成 ZIP CRC、aapt2、apksigner、zipalign 检查后才复制回项目，清理本轮无用临时文件。

发布要求：每个 PR 独立可回退，记录计数和体验结果；不预先承诺百分比续航提升。若通知、ANSI 顺序、恢复一致性或输入延迟退化，先回退相关策略，不以节电为由接受功能损失。

