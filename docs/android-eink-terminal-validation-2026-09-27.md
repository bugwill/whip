# 终端批处理与诊断验证记录

日期：2026-09-27。范围：PR2 `TerminalRendererHost` 调度、PR0 终端/WebView 内存诊断与生成资产。此记录基于自动验证；未在本任务中构建 APK 或执行真机测量。

## 最终自动测试

最终源码冻结后再次执行：

```bash
npm test -- --runInBand __tests__/terminalRendererHost.test.tsx __tests__/terminalWebDiagnostics.test.ts __tests__/terminalBatchScheduler.test.ts __tests__/terminalAssets.test.ts __tests__/terminalAssetGeneration.test.ts __tests__/terminalEinkStream.test.ts
```

结果：6 个套件全部通过，61 项测试通过，0 snapshot；本次输出耗时 8.44 秒。

覆盖包括：

- 被动输出从首个待处理写入等待 250ms；连续到达超过 2s 后采用 500ms，稳定持续输出低于容量阈值时每秒两次定时注入；1s 无新到达后回到 250ms。采用单调时钟，无空闲轮询。
- Herdr ANSI 写入顺序、64KiB 压力冲刷、输入快通道、500ms 窗口后的首个慢回显、5s 首响应等待标记到期。
- plain SSH 的 string 和 ArrayBuffer 两条 UTF-8 路径；首次 reset 立即处理、ANSI 分片顺序、32 写入压力冲刷、慢回显立即注入；卸载后无残余批处理计时器。
- 纯调度器的连续输出阈值与空闲重置；WebView UTF-8 解码保留分片中文及 emoji。
- profile 切换先冲刷旧队列再配置；pane 切换、隐藏 Herdr 的 baseline 恢复、resize/recovery、background/foreground、缓存驱逐和控制器生命周期既有测试继续通过。plain SSH 后台保留连接的既有行为继续通过。
- 诊断关闭时不采集 WebView 写入；累计快照不因 collect 重置；跨场景未完成 callback 不污染新场景。
- 场景结束等待 WebView snapshot ACK；collect 与 ACK 之间仍到达输出时不会重新开启即将结束的 generation；再次 begin 的新 generation 明确重启 WebView 采集；ACK 后清理此次收集 deadline。
- Android/iOS 生成资产、生成器及终端脚本相关既有验证。

首次显示、UTF-8 full、完整 ANSI baseline、reset 与带输入/resize trace 的帧走立即处理；旧队列先冲刷，保持调用顺序。release、dispose、recovery、WebView reload 和 profile 配置清理到达活动状态。卸载对所有 session 类型清理批处理队列计时器，不丢弃原始增量 ANSI 来节流。

## 诊断导出语义

诊断默认关闭。JS 内存记录接收帧数/字节数、实际 WebView 注入、每批字节/写入数、冲刷原因和最老等待；plain SSH 字节另区分当前可见/隐藏。不创建计数轮询、不逐事件日志、不持久化、不驱动 UI。待显示帧回放不重复累计接收帧。

使用 `performanceTrace` 提供的场景 begin/end；global 调试入口 `__whipPerformanceDiagnostics.begin()` 和异步 `await __whipPerformanceDiagnostics.end()` 由对应模块提供。TerminalRendererHost 注册结束收集器：先冲刷队列，再请求各 ready WebView 的累计快照，收到 requestId ACK 后才允许全局关闭并导出。2s 有限 deadline 只在显式场景结束收集时创建；超时计数为 `webview.collectionTimeout`，卸载会清理等待。

WebView 每 pane 的 gauges 是该次收集瞬间的累计 `writes`、`bytes`、`completed`、`totalWriteMs`、`maxWriteMs` 和 `pendingWriteBytes`，不能跨快照简单相加，也不是每次 collect 的增量。写入耗时从 xterm write 调用到 completion callback；`pendingWriteBytes` 是已纳入诊断、尚未完成 callback 的字节。ACK 表示快照消息已发出，**不表示所有 xterm write 已完成**；因此 pending 可非零。

场景 generation 在 begin 时变化；终端在结束等待 ACK 期间禁止该 generation 重新开启采集。新 generation 重置 WebView 累计，并隔离此前未完成 callback。动态开关仅在状态/generation 变化时随帧同步，无逐帧额外诊断消息。collect 不合并 xterm 字节流，也不改变 `full`、`seq`、`final` 或 ANSI 数据。

## 生成资产与 lint

实施期间执行 `node scripts/sync-terminal-assets.mjs`，从生成器同步 Android `android/app/src/main/assets/herdr-terminal.html` 与 iOS `modules/whip-terminal-assets/ios/TerminalAssets/index.html` 等既有资产。冻结后再次执行：

```bash
node scripts/sync-terminal-assets.mjs --check
npx eslint src/components/TerminalRendererHost.tsx src/lib/terminalBatchScheduler.ts __tests__/terminalBatchScheduler.test.ts __tests__/terminalWebDiagnostics.test.ts --max-warnings 0
```

资产 check 退出码 0；定向 lint 通过。没有手改生成 HTML。生成资产为仓库忽略输出，因此不以 `git status` 出现与否作为是否同步的证据。

未宣称全仓 lint 通过：把生成器交给当前 ESLint 配置时，既有第 53 行 import 语法报解析错误；完整 host 测试文件另有既有 `jest/valid-expect` 警告。本任务定向 lint 包含生产 Host、纯调度器与两个新增独立测试。

## 真机门槛

这些测试只证明调度、顺序、生命周期、计数及脚本行为；不能得出真实 CPU 降幅、输入 p95、面板刷新率或续航收益。真实设备 CPU、输入 p95 和场景基线由 `device_baseline` 任务负责，需结合其实际设备/ADB结果记录；本记录没有替代或虚构这些数据。
