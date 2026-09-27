# Android E-Ink Rust PR0 / PR3 / PR4A 实现与验证

日期：2026-09-27。此记录覆盖 Rust 源码及生成绑定，不代表真机续航结果。

## 行为

- E-Ink OpenCode 活跃 consumer 的无变化 cursor 查询采用 1.2 / 2.4 / 5 / 10 秒等待；普通屏保留 1.2 秒。变化、输入、pane agent 状态、consumer 激活、连接恢复重置退避。每个同步链沿用 epoch / generation；Notify 单次 permit 可中断睡眠，并保留请求执行期间到达的唤醒。暂停、关闭、重启主动释放旧睡眠；旧响应及旧任务不能复活已失效 session。
- 保留 10 秒兜底查询。无事件唤醒时，最坏发现延迟是当前退避等待加远端查询/处理时间，不保证即时可见。尚未测量远端消息创建到屏幕绘制的延迟。
- E-Ink Hosts 延迟间隔改为 60 秒，health 同为 60 秒；同轮只有一次 probe。成功控制快照可替代 health probe；可见 RTT 仍需要测量。后台不做可见 RTT 探测。
- 前台 reconcile 120 秒；只有后台、事件订阅实际成功且未重试、状态 fresh、无缺口时为 300 秒。新增独立 force_reconcile；前台恢复、缺口、事件流恢复强制对账。force 在 await 前取走，await 期间新缺口保留下一次 force。失败推进尝试 deadline，避免立即反复失败形成空转。
- 事件订阅增加内部 active 状态，重试耗尽不能仅凭 retry_running=false 被视为健康。close 递增 operation_epoch，避免 setup await 的迟到成功覆盖已经发生的 close。setup 返回内部 owned subscription handle：stale completion 只按自己创建的流 id 清理；复用现有流的 handle 不拥有清理权。
- keepalive、SSH inactivity timeout、Android WakeLock 均保留原策略。

## 诊断 API

包导出 `setPowerDiagnosticsEnabled(enabled, reset)` 与 `powerDiagnosticsSnapshot()`（JSON string）。默认关闭；不开启日志、磁盘写入、timer 或 UI 事件。JS scene API 由 runtime 初始化时注册 adapter，一次场景结束读取快照。

- `actualProbe`：通过连接状态检查后实际进入 probe 的调用总数。
- `healthProbeDue` / `latencyProbeDue`：触发 probe 的调度原因，可能重叠，也可能因稍后断线未执行；不能相加当请求总数。
- `reconcile`：进入 refresh_host_state_inner 的对账尝试数，包括监控、显式刷新与恢复。
- `probeFailure` / `reconnect`：probe 失败数 / 已接受的重连生命周期数。
- `openCodeCursor` / `openCodeNoChange`：cursor 尝试 / 未变化数。
- `openCodeCursorMicros`：成功返回 cursor 查询的累计耗时；失败耗时当前未计入，不应除以所有尝试数得出无偏平均。
- `openCodeVisibleMicros`：有变化时从 cursor 查询启动到 Rust 转录应用的累计耗时，不能当作远端消息创建到屏幕 paint 的延迟。

## 自动验证

使用独立本轮目录 `/dev/shm/whip-rust-power-target`，所有 Rust 编译输出在 tmpfs；没有编译 APK，也没有访问 SSH 密钥或敏感 env。

```sh
CARGO_TARGET_DIR=/dev/shm/whip-rust-power-target /home/ubuntu/.cargo/bin/cargo test --manifest-path packages/react-native-whip-ssh/rust/Cargo.toml --lib agent_sessions::tests
CARGO_TARGET_DIR=/dev/shm/whip-rust-power-target /home/ubuntu/.cargo/bin/cargo test --manifest-path packages/react-native-whip-ssh/rust/Cargo.toml --lib host_runtime::
CARGO_TARGET_DIR=/dev/shm/whip-rust-power-target /home/ubuntu/.cargo/bin/cargo test --manifest-path packages/react-native-whip-ssh/rust/Cargo.toml --lib herdr_events::tests
```

结果：agent_sessions **31 通过**；host_runtime **88 通过**；herdr_events **15 通过**。最终相关子集均以默认并行模式运行。

新增关键测试包含：真实 10 秒旧 poll 在 pause / close 后 250ms 内释放任务；执行期间保留唤醒 permit，消费一次后不空转；foreground/gap force 在 snapshot 期间再次到达仍保留；死订阅及 setup/close token 失效；旧 owned subscription 清理保留替代流，真实 existing-id 复用路径的 borrowed handle 不清理替代流；真实 disconnected worker 同时 health/latency 到期时 50ms 内各 due 仅一次、actualProbe=0，观察量使用每 runtime 的 cfg(test) 局部字段以避免全局计数器并行串扰；共同 probe 决策及成功 snapshot health 复用；仅 fresh background 有效事件流延长周期。

绑定按仓库既有 ubrn 工作流生成：先 cargo build --lib 到上述 tmpfs target，再 `ubrn generate jsi bindings --library` 从 `debug/libwhip_ssh.a` 生成 TS / C++。未安装 clang-format，生成器提示跳过 C++ 格式化；仅新增生成行去尾部空白，既有行保持原样。

真实联网回放、输入/通知/消息可见延迟、断网恢复和电荷/功率对照仍需最终设备验证。此处测试只证明调度、取消与恢复逻辑，不能推算节电百分比。
