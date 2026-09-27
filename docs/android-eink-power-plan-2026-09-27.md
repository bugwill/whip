# E-Ink Android 平板节电方案（2026-09-27）

> 本文基于代码阅读得出，**尚未做功耗实测**。每项建议都附带验证方法，建议先测量、再按收益排序实施。

## 1. 耗电模型

E-Ink 平板和普通 LCD/OLED 手机的耗电结构不同：

| 耗电源 | E-Ink 上的特点 | 本应用能影响的部分 |
| --- | --- | --- |
| 屏幕刷新 | 静止画面几乎不耗电，**每次画面变化**都会驱动电泳并触发整条渲染链 | UI 更新次数、终端注入次数 |
| 无线射频（Wi-Fi） | 每次收发都会让射频从低功耗态唤醒，并在尾巴时间内保持高功耗 | SSH keepalive、健康探测、轮询、对账 |
| CPU / JS / WebView | E-Ink 平板 SoC 普遍较弱，同样的工作占用时间更长 | React 提交、xterm 写入、FFI 事件 |
| 前光 | 通常是亮屏时最大的单项 | 无（系统设置） |

所以节电思路是：**减少画面变化次数，减少射频唤醒次数**。

## 2. 现状（已做到的）

代码已有相当完整的 E-Ink 策略（`src/lib/displayProfile.tsx` 自动识别，也可以手动指定）：

- **动画**：`useDecorativeProgress` 在 E-Ink 下不启动帧回调，`NativeAgentSpinner` 被禁用，`useReducedMotion` 恒为 true。Herd、Hosts、文件管理、图片缩放的弹簧动画都直接跳到终点，Modal 动画为 `none`。
- **终端 WebView**：光标不闪烁、不透明、无背景图；xterm 最多驻留 3 个（`terminalRendererLru.ts`）；Herdr 终端的 scrollback 最多 1000 行。
- **终端写入合并**：Herdr 终端在 E-Ink 下按 100ms 窗口、64KB 或 32 帧合并注入（`TerminalRendererHost.tsx:92-96`）；刚有输入后的 500ms 内立即注入。
- **只连当前终端**：E-Ink 下非活动终端和进入后台的终端会释放控制器，只保留快照（`releaseEinkController`）。
- **Chat**：E-Ink 下只有当前选中、且用户明确打开的 Chat 保持远端订阅（`SessionScreen.tsx:1046-1062`），其余在 Rust 侧暂停流。
- **监控间隔**：E-Ink 下健康探测 60s，Hosts 页可见时延迟探测 15s（普通屏为 15s / 3s，见 `monitoring.rs:6-10`）。
- **后台功耗方案**：E-Ink 下自动选 Balanced，不持有 WakeLock。
- **息屏或锁屏会完全断开**：`useSessionRuntimeManager` 把 `deviceLocked` 视为 `monitoringPaused`，并调用 `pauseForDeviceLock()` 销毁所有 runtime、关闭 SSH；Android 前台服务也同时停止。解锁并回到前台后再重连。
- **事件订阅**：没有订阅 `pane.output_changed`（订阅类型为 None，见 `herdr_events.rs:96`），终端输出不会以事件形式持续推送。

> 更正：上一轮口头建议中的“息屏时 Rust 仍保持连接、应暂停网络”**不成立**，锁屏路径已经完整断开，本文不再列入。

## 3. 使用场景与剩余耗电点

| 场景 | 当前行为 | 剩余主要耗电 |
| --- | --- | --- |
| A. 前台，看 agent 持续输出 | 100ms 合并注入 xterm | 屏幕刷新约 10 次/秒，WebView 和 JS 负载 |
| B. 前台，画面静止 | SSH 保活，Hosts 页有延迟探测 | keepalive 每 15s 一次、健康探测 60s、对账 120s、延迟探测 15s（各自独立唤醒）；延迟数值变化会刷新屏幕 |
| C. 亮屏，但切到其他应用（例如阅读器） | 前台服务运行，runtime 保留，事件订阅继续 | 同 B 的网络唤醒；另外每次 host state 变化仍在 JS 中提交整个视图 |
| D. 息屏或锁屏 | 已完全断开 | 无（已最优） |
| E. 打开 OpenCode 的 Chat | Rust 每 1.2s 在远端执行一次 CLI | 持续射频活动 |

在 E-Ink 平板上，**C 很常见**（一边读文档，一边挂着 agent 等通知），也是目前优化最少的场景。

## 4. 方案

按预期收益与风险排序。P1–P3 建议优先做。

### P1. 终端输出自适应合并（场景 A，预期收益：高）

**问题**：agent 持续输出时，100ms 窗口意味着每秒最多约 10 次注入。每次注入都会触发 xterm 重绘和墨水屏局部刷新。墨水屏局刷本身就要 100–300ms 以上，更快的注入对用户没有可见收益，只会增加耗电和残影。直连 SSH 会话（`session.kind === 'ssh'`）在 E-Ink 下完全不合并（`TerminalRendererHost.tsx:389`）。

**方案**：
1. 把固定的 `EINK_FRAME_BATCH_WINDOW_MS = 100` 改成分级窗口：
   - 交互窗口内（输入后 500ms 内，或等待首个回显期间）：保持立即注入，不影响打字手感。
   - 交互窗口外，输出刚开始：250ms。
   - 连续输出超过约 2s：放宽到 500–1000ms。
   - 输出停止后回到 250ms。
2. 直连 SSH 会话也采用上述策略，但只在交互窗口外生效。现有的回显判定（`einkAwaitingFrameUntilMs`）可以直接复用。
3. 可选：做成设置项“E-Ink 刷新节奏：跟手 / 均衡 / 省电”，对应最大窗口 250 / 500 / 1000ms。

**涉及文件**：`src/components/TerminalRendererHost.tsx`（`dispatchFrameScript`、常量区），`__tests__/terminalRendererHost.test.tsx`。

**风险**：直连 SSH 的全屏 TUI（vim、htop）在没有输入时的更新会变慢；上限 64KB/32 帧的强制冲刷保持不变，不会造成无限积压。

**验证**：用现有的 `performanceTrace` 统计每分钟 `injectJavaScript` 次数；对比同一段 agent 输出下 `dumpsys batterystats` 的 CPU 时间。

### P2. 后台时不提交 UI 投影（场景 C，预期收益：中高）

**问题**：`useSessionConnectionLifecycle.ts:277-296` 的 `acceptHostState` 在每次 host state 变化时都会调用 `commitAppCore(appCoreRef.current.view())`，从 Rust 拉取整个 AppCore 视图、跨 FFI 转换，再 `setState` 触发 React 重渲染。应用在后台（亮屏但被其他应用覆盖）时，这些工作完全没有观众，却仍会逐事件执行。通知逻辑 `handleAgentStateChange` 才是后台真正需要的部分。

**方案**：
1. `acceptHostState` 中始终调用 `handleAgentStateChange`（通知依赖它）。
2. 当 `AppState.currentState !== 'active'` 时，只设置一个 `projectionDirty` 标记，跳过 `commitAppCore`。
3. `AppState` 变为 `active` 时，如果标记为脏，就提交一次。
4. E-Ink 前台时也可以给 `commitAppCore` 加一个约 500ms–1s 的尾部合并，避免 agent 状态快速抖动时 Herd 页面连续刷新。注意：用户自己的操作（切换、创建、关闭）应当立即提交。

**涉及文件**：`src/hooks/useSessionConnectionLifecycle.ts`，可能还有 `src/hooks/useSessionRuntimeManager.ts`（已有 `appActive` 状态可复用）。

**风险**：回到前台的第一帧可能显示旧数据，需要确保恢复时同步提交，而不是放进 `startTransition`。通知判定依赖 `snapshotFromHostState`，它仍需每次执行，但开销远小于整棵 React 树重渲染。

**验证**：后台挂 10 分钟、agent 持续工作，对比 JS 线程 CPU 时间（`dumpsys cpuinfo` / Perfetto，仓库已有 `android-terminal-perfetto.yml` 与 `docs/android-performance-tracing.md`）。

**待测量**：Herdr 的 `pane.updated` 是否会因终端标题变化等原因频繁触发。如果是，P2 的收益会明显更大。可以临时在 `recordNetworkDiagnostic` 中统计每分钟的事件数量来确认。

### P3. 网络唤醒按模式分级并合并（场景 B、C，预期收益：中高）

**问题**：空闲时有四个相互独立的周期性网络活动：

| 来源 | 位置 | 周期 | 是否区分 E-Ink |
| --- | --- | --- | --- |
| SSH keepalive | `ssh/mod.rs:972-974` | 15s（`keepalive_max` 3，`inactivity_timeout` 30s） | 否 |
| 健康探测（SSH 往返） | `monitoring.rs:7` | 60s | 是 |
| 状态对账（完整快照） | `monitoring.rs:8` | 120s | 否 |
| 延迟探测（仅 Hosts 页可见时） | `monitoring.rs:10` | 15s | 是 |

它们的相位互不对齐，因此射频的实际唤醒次数约等于各自次数之和。其中 keepalive 占了最大份额（每分钟 4 次）。

**方案**：
1. **keepalive 按模式配置**：把 `SshConnectionConfig` 扩展为可传入 keepalive 间隔，Balanced 或 E-Ink 下使用 45–60s，`inactivity_timeout` 相应设为间隔乘以 `(keepalive_max + 1)` 以上。Realtime 保持 15s。
2. **有流量就不探测**：`RuntimeInner` 记录最近一次入站数据时间（事件、终端帧、请求响应都算）。健康探测到期时，如果最近 N 秒内已有入站流量，就直接视为健康、跳过探测。keepalive 已能在 `interval × max` 内发现断链，因此后台时健康探测可以完全交给 keepalive。
3. **对账放宽**：事件订阅正常且 `is_fresh` 时，后台对账从 120s 放宽到 10 分钟；回到前台时强制对账一次（`force_probe` 机制已存在）。
4. **合并定时器**：让健康探测、对账与 keepalive 共用一个节拍（例如都取 keepalive 间隔的整数倍），使它们在同一次射频唤醒中完成。
5. **E-Ink 延迟显示**：Hosts 页的延迟数字每 15s 变化一次，每次都会刷新墨水屏。E-Ink 下改为 60s，或只在跨越阈值（正常、慢、失败）时更新显示。

**涉及文件**：`packages/react-native-whip-ssh/rust/src/ssh/mod.rs`（`connect_inner`）、`host_runtime/monitoring.rs`、`host_runtime/connection.rs`，以及把功耗模式传给 Rust 的 FFI（`setMonitoringState` 已经带 `is_eink`，可以再加 `power_mode`）。

**风险**：部分路由器或 NAT 的 UDP/TCP 空闲超时较短，放宽 keepalive 后连接可能被静默丢弃，要到下一次 keepalive 才能发现，届时会走重连。建议保留 Realtime 作为逃生选项，并在设置文案中说明。

**验证**：`adb shell dumpsys batterystats --reset` 后亮屏静置 30 分钟；对比 `dumpsys batterystats` 中的 Wi-Fi 活跃时间与唤醒次数；也可以在服务端用 `tcpdump` 统计包间隔。

### P4. OpenCode 转录轮询自适应退避（场景 E，预期收益：中）

**问题**：`agent_sessions.rs:19` 的 `OPENCODE_POLL_DELAY` 固定为 1.2s。每次轮询都会在远端通过登录 shell 执行一次 `opencode` CLI 查询游标（`sync_opencode`）。只要 OpenCode 的 Chat 视图处于激活状态，就持续每秒左右一次射频往返，远端也要启动一次进程。默认 `agentCommand` 就是 `opencode`，所以这是常用路径。

**方案**：
1. 游标未变化时指数退避：1.2s → 2.4s → 5s → 10s（E-Ink 上限可以设为 15s）。
2. 以下情况重置为 1.2s：游标发生变化；收到该 pane 的 `pane.agent_status_changed`（已经按 pane 订阅）；用户在 Chat 中发送消息。
3. 更进一步：agent 状态为 `idle` 或 `done` 时暂停轮询，只依赖状态事件唤醒。

**涉及文件**：`packages/react-native-whip-ssh/rust/src/agent_sessions.rs`（`schedule_opencode_poll`、`sync_opencode`），需要从 `host_runtime/agents.rs` 把 agent 状态变化通知给 transcript manager。

**风险**：agent 在工作但游标暂时不变时，新消息最多延迟一个退避周期出现；由状态事件重置可以缓解。

**验证**：打开 OpenCode Chat 静置 10 分钟，在服务端统计 `opencode` 进程启动次数（例如 `auditd` 或 `ps` 采样）。

### P5. E-Ink 下的 UI 刷新点清理（场景 A、B，预期收益：低到中）

以下几处在 E-Ink 下仍有动画，或会产生多余的局部刷新：

- `OverlayScrollbar.tsx:80,91`：滚动条 `withTiming` 渐显渐隐，已通过 `useReducedMotion` 判断，需要确认 E-Ink 下是否会直接跳到终点而不是逐帧插值。
- `TerminalScreen.tsx:379`、`SettingsScreen.tsx:987`、`AboutScreen.tsx:56`、`app-ui.tsx:347`：使用 `withTiming`，需要逐个确认 E-Ink 下是否跳过动画。
- `TerminalDirectionPad.tsx:69`：长按连发的 `setInterval`，属于用户主动操作，可以保留。

**方案**：统一提供一个 `useMotionTiming()` 工具，在 E-Ink 或减少动态效果时返回立即赋值；对上述调用点逐一替换。

**验证**：在设备上打开“显示界面更新”（开发者选项），观察画面静止时是否仍有区域闪烁。

### P6. 后台功耗方案的语义清理（预期收益：无直接收益，属于纠正误导）

`HerdrBackgroundService` 在锁屏或息屏时会直接停止（`onStartCommand` 中的 `isKeyguardLocked`、`isInteractive` 检查），Realtime 的 `PARTIAL_WAKE_LOCK` 因此只在亮屏时持有，而亮屏时 CPU 本来就不会休眠。所以 Balanced 和 Realtime 的实际功耗差别很小，用户切换这个选项不会带来预期中的效果。

**方案**：让这个开关控制 P3 中真正影响功耗的参数（keepalive 周期、后台对账周期、后台健康探测），并更新 `settings.backgroundPowerBalancedCopy` 等文案；可以移除无效的 WakeLock。

### P7. 长期：服务端推送替代常驻连接（预期收益：最高，工作量大）

后台通知目前依赖常驻 SSH 事件订阅，而锁屏时会断开，所以锁屏后本来就收不到提醒。如果 Herdr 服务端能在 agent 变为 `blocked` 或 `done` 时通过 ntfy、UnifiedPush 或 FCM 推送，那么场景 C 可以完全断开 SSH，锁屏时也能收到通知。

**代价**：需要新增一个与 mobile 无关的中立 Herdr 能力（符合 `ARCHITECTURE.md` 中“不做 mobile 专用端点”的原则）；涉及第三方推送服务的隐私取舍；E-Ink 设备（尤其是国产型号）常常没有 GMS，更适合 UnifiedPush 或 ntfy。

## 5. 实施顺序建议

1. **先测量基线**：场景 A、B、C、E 各 30 分钟，记录 `dumpsys batterystats`（CPU、Wi-Fi 活跃时间、唤醒次数）和注入、提交次数。
2. **P2**（改动小、风险低，只涉及 JS）。
3. **P1**（只涉及 JS，影响手感，需要真机调参）。
4. **P3**（涉及 Rust 与 FFI，需要 NAT 超时实测）。
5. **P4**，然后是 **P6**（依赖 P3）。
6. **P5** 顺手清理。
7. **P7** 另行立项。

## 6. 测量方法

```bash
adb shell dumpsys batterystats --reset
adb shell dumpsys batterystats --enable full-wake-history
# 运行场景……
adb shell dumpsys batterystats io.github.kaminarios.whip > stats.txt
adb shell dumpsys power | grep -i wake
adb shell dumpsys alarm | grep -A3 kaminarios
```

- 应用侧计数：借助 `src/services/performanceTrace.ts` 的现有 trace 点，统计终端注入次数和 `commitAppCore` 次数。
- 服务端侧：`tcpdump -i any port 22 and host <tablet-ip>`，看包间隔分布。
- 屏幕刷新：开发者选项中的“显示界面更新”，或者拍摄慢动作视频数刷新次数。

## 7. 用户侧可立即调整的设置（不改代码）

- 关闭前光或降低亮度，这是亮屏最大的单项耗电。
- 保持“保持屏幕打开”关闭（默认关闭）。
- 不需要后台通知时关闭通知开关：`shouldRetainBackgroundRuntimes` 会因此不在后台保留连接，前台服务也不会启动。
- 设备的 E-Ink 刷新模式选“均衡”或“普通”，不要选“极速/A2”。后者刷新频率更高、更耗电。
- 平时停留在 Herd 或终端页，而不是 Hosts 页，避免每 15s 一次的延迟探测。
