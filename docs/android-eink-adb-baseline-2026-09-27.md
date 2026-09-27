# Android E-Ink ADB 短基线

日期：2026-09-27 约 13:59–14:01 SGT。执行模型：GPT 6 Sol，medium。设备：`BA51B0H2FK7A007000047`。本报告仅记录真实观察；不是受控功耗对照。

## 环境

- Whip：`io.github.kaminarios.whip`，1.7.0，versionCode 245，targetSdk 36。
- Android 14，设备型号属性 `vnd_k6877v1_64_k419`。
- WebView：`com.google.android.webview.beta` 155.0.8059.16。
- USB 充电中（status 2），初查 31%、31.9°C，charge counter 913260 µAh；短测时 32–33%，31.9–32.0°C。
- 系统 brightness 103；厂商刷新模式/实际前光未验证，因此不能据此宣称面板设置受控。
- 初始窗口报告包含 Whip 与 MiXplorer，可能为分屏；没有读取 UI 内容、应用私有存储或连接配置。
- 初查只有 WebView sandbox 服务；随后现有运行时自行出现 HerdrBackgroundService。没有启动 app、创建连接或执行任何 SSH 操作。现有连接/工作负载内容未验证。

## 30 秒短采样

读取 Whip PID 28589 的 `/proc/28589/stat` 第 14、15 字段，`getconf CLK_TCK` 为 100。CPU 为进程 utime+stime 差值，不包含独立 WebView 子进程。

|阶段|观察时长|Whip CPU 秒|相当于单核占用|前台服务|电荷计数|
|---|---:|---:|---:|---|---|
|保留现有静止窗口|30.190 s|6.28|20.8%|起止均有 HerdrBackgroundService|942720→942720 µAh|
|Home 后台|30.299 s|2.25|7.4%|起止均有 HerdrBackgroundService|942720→942720 µAh|
|请求熄屏|30.236 s|3.33|11.0%|开始有，结束已消失|942720→972180 µAh|

请求熄屏后首个读数 `mWakefulness=Asleep`，30 秒后却已是 `Awake`。因此第三段**不能**称为完整 30 秒锁屏基线；没有记录准确唤醒时点/原因，也没有验证 runtime 销毁或最后网络包时刻。服务消失证明某次清理发生，但不能证明 JS 永不延迟或每次锁屏都正确。

初查与结束的 power 列表未发现 Whip/Herdr partial wakelock；存在系统 UI、AudioMix 等其他唤醒锁。未观察到持锁场景，故无证据支持删 Whip WakeLock。

短测结束执行 WAKEUP，保留在 Home/系统当前界面，未启动或恢复 Whip。没有重置 batterystats、电池模拟状态、系统亮度、Wi-Fi 或应用数据。

## 采集命令与计算

所有 adb 命令使用 `adb -s BA51B0H2FK7A007000047 shell` 前缀：

```sh
getprop ro.product.model
getprop ro.build.version.release
dumpsys package io.github.kaminarios.whip
dumpsys webviewupdate
dumpsys battery
dumpsys power
dumpsys activity services io.github.kaminarios.whip
settings get system screen_brightness
dumpsys window
cat /proc/28589/stat
cat /proc/uptime
getconf CLK_TCK
input keyevent KEYCODE_HOME
input keyevent KEYCODE_SLEEP
input keyevent KEYCODE_WAKEUP
```

每个阶段先读取 stat/battery/power/services，主机 `time.sleep(30)` 后再读一次；时长使用主机单调时钟。CPU 秒 = `(end utime+stime − start utime+stime) / 100`。报告中的 shell 输出只提取版本、窗口包名、服务类型、唤醒锁标签和电池字段，不读取连接内容。

## 修改建议与验证缺口

1. 先落实诊断计数、后台投影门控、终端 250/500ms 批处理。当前可见/后台都有 CPU 活动，但现有工作负载未知，不能归因到某个热点。
2. 保留锁屏连接清理与 WakeLock 策略。最终包复查服务退出、定时器取消和恢复顺序，避免凭本次一次观察删锁。
3. OpenCode 退避与 monitoring 调度可用确定性单测验证请求率、立即唤醒和生命周期；不通过设备既有配置重连，因为可能间接加载被禁止访问的 SSH 密钥。
4. 本次电荷计数在充电且量化跳变约 29460 µAh，不能换算应用耗电或节电百分比。没有功率轨、外部功率计或未充电重复对照证据。
5. 尚缺：受控连续输出/ANSI/TUI/输入 p95、OpenCode 最终消息可见、通知无遗漏、网络切换、无密钥工作负载、至少三轮 20–30 分钟旧/新交错功耗对照。最终验收应区分代码行为证明、实机安装/状态证明与仍未完成的真实功耗测量。

遵守禁止访问 SSH 密钥及两份敏感 env 的要求；没有读取敏感文件、应用数据库/私有存储，没有新建 SSH 连接，也没有调用可能加载密钥的 SSH 客户端。

## 追加：认证澄清后的远端可测条件

用户随后授权通过既有 SSH 认证运行命令，但仍禁止读取/复制/输出密钥。执行：

```sh
ssh -o BatchMode=yes -o ConnectTimeout=10 ubuntu 'uname -s; command -v herdr; command -v opencode'
```

返回 exit 255：`ubuntu@ubuntu: Permission denied (publickey).` 未读取 SSH 配置/密钥、未猜测其他账号或主机。未建立独立测试 pane，因此连续输出/OpenCode 远端验收仍缺证据。

## Release 构建准备（尚未构建）

`build-android.sh` 原先即使 Cargo 接受外部 CARGO_TARGET_DIR，仍从源码树 rust/target 取静态库，可能混入旧库。已改为统一解析 target_directory，显式传 Cargo `--target-dir`，再从同一路径 install 和生成绑定；相对路径以调用目录为基准。`bash -n` 已通过。

`/dev/shm` 为 tmpfs，约 7.68 GiB 空闲；`/tmp` 实际为 ZFS，不能用作构建替代。建议本轮唯一目录 `/dev/shm/whip-release-20260927`，Rust target 与 Gradle output 各自子目录，不能复用/删除其他 agent 正使用的 Cargo target。构建前再次检查空间；不足应找 ext4，不能退回 /Documents 或 /tmp 归档。

Gradle 临时 init script 应用 `gradle.beforeProject`，对所有项目（含 included plugin builds）将 `layout.buildDirectory` 指向 tmpfs。目录名使用 projectDir 路径散列加 project.path，避免 root/plugin 构建撞名。仅重定向 app 不够，库 AAR/JAR 和 included plugin JAR 也需在 tmpfs。使用 `-I <init-script>` 并在正式构建前列出实际 buildDirectory 检查。

建议环境/命令：`ANDROID_HOME=/home/ubuntu/Android/Sdk`、`ANDROID_SDK_ROOT` 同值、`EXPO_NO_DOTENV=1`、`CARGO_TARGET_DIR=<本轮tmpfs>/rust-target`；Gradle `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a -Pwhip.previewSigning=true`。保留 Release 的 R8，不以 skipR8 冒充最终优化版。

签名兼容尚未验证：preview 使用项目 debug identity；应对设备已装 APK 与新包执行 apksigner 证书摘要比较，不读取签名秘密内容。签名不匹配不能卸载丢用户数据；仅报告具体冲突。新 APK 必须通过 ZIP CRC、aapt2、apksigner、zipalign，再复制正常输出路径并复核 checksum，最后 `adb install -r`。临时构建文件保留到验证/安装/故障定位结束后，仅清理本轮确定拥有的目录。

后续设备条件变更（由主 agent 执行）：为避免用户睡眠期间设备自动锁屏，`adb svc power stayon usb` 后 stay_on_while_plugged_in 从 0 变为 2，mStayOn=true/Awake。该变更发生在本报告 90 秒短测之后；后续对照须记录保持亮屏条件，最终结束恢复原值 0。

## 新授权后的应用可用性检查

使用 `adb shell am start -n io.github.kaminarios.whip/.MainActivity` 把现有任务带到前台；通过临时截图检查可见 UI，未读应用私有存储。既有 Herdr 终端可见，包含多个 workspace/tab/pane，当前真实 agent 仍运行。没有向真实终端输入、发送 agent 消息或终止进程；报告不保存其终端正文。

可安全隔离的受控工作负载方案：创建全新 workspace，使用唯一测试标签和 `/tmp` cwd，通过 `workspace.create` 返回的新 root pane 执行固定的 printf/sleep 流；仅关闭本次创建的测试 workspace。源码 SessionScreen 的创建流程表明此操作新建独立工作区，不需操作既有 pane。当前只报告方案，尚未创建；OpenCode Chat 消息路径尚未实际验证。现有工作区中的新 tab 会改变其焦点，优先使用独立 workspace。

## 独立 workspace 受控回放：条件与负载

创建 `whip-eink-test-20260927` workspace，cwd `/tmp`，通过唯一新 root pane 运行下列 Python 代码（Compose 输入 Base64 包装后的 `python3 -c`，发送前与本地命令逐字比对通过）：

```python
import time
for i in range(1,1801):
    print("\033[32mWHIPSEQ %04d\033[0m" % i, flush=True)
    time.sleep(0.1)
print("WHIPDONE count=1800 sum=1620900", flush=True)
```

1800 次输出，每次约 23 字节 ANSI 数据，目标 10Hz，约 180 秒加调度开销；远低于容量阈值。只在本次新建 pane 发送，不触碰真实 agent。现有真实 agents 同时工作是无法消除的混杂因素。最终留该测试 workspace 空闲到新版复测；完成全部测试后关闭它。

应用 More 设置明确 `E-Ink` selected=true，原值即 E-Ink，不修改 profile。厂商刷新模式与前光未改变但未量化。brightness 103；USB 充电，stay_on_while_plugged_in=2。诊断未启用。为了准确 ASCII 输入临时将 IME 从 `com.tencent.wetype/.plugin.hld.WxHldService` 切换为系统 `com.android.inputmethod.latin/.LatinIME`；测试完成须恢复原 IME。

CPU 采样：Whip PID 28589，其绑定 WebView sandbox PID 28893，CLK_TCK=100；发出 Send 前采起点，每30秒一次，180秒结束。第一30秒含一次确认截图与 KEYCODE_BACK 隐藏键盘操作，新版须相同预热、以30→180秒稳态区间为主要比较。确认截图已看到 WHIPSEQ 0096…0115 连续序号，证明发送已执行。截图读取有开销，不在稳态区间连续截图或启用 trace。

### 旧版回放 CPU 结果

|采样点秒|Whip累计CPU秒|WebView累计CPU秒|
|---:|---:|---:|
|30.163|17.26|3.35|
|60.237|37.21|8.46|
|90.351|56.87|13.58|
|120.447|76.74|18.96|
|150.529|96.52|24.01|
|180.682|116.33|29.23|

主要稳态30→180秒为150.519秒：Whip99.07 CPU秒（65.8%单核），WebView25.88秒（17.2%），合计124.95秒（83.0%单核）。CPU数值含现有后台真实 agents 的活动；不代表单独终端的准确归因或电池功率。

回放确认结束后使用终端 Latest 按钮到最新位置，截图确认 WHIPSEQ 1767…1800 连续、`WHIPDONE count=1800 sum=1620900` 与 shell prompt 可见。仅证明可见尾段与结束标记；完整1800行没有全量提取，不声称全流无丢帧。首次180秒采样后屏幕曾显示1697…1728，后续检查/滚动可见旧scrollback；结束标记随后确认，源程序调度开销与呈现/滚动位置都可能影响截图，未量化端到端延迟。

输入p95未测：本轮默认诊断关闭、未搭建可靠 trace 导出；截图/ADB命令完成时间不能代替输入到可见软件呈现，更不能代替墨水面板刷新。未向真实agent发送测试消息；通知无遗漏尚无受控消息证据。

结束时USB充电，41%、charge counter1207860µAh、33.2°C。短CPU结果不能计算节电百分比。与新版对照时须记录温度变化及真实agent混杂因素，并重复同一命令、同一profile与稳态区间。

回放后Home后台观察30.279秒：Whip2.71 CPU秒、WebView0.02秒；起止HerdrBackgroundService均isForeground=true，mWakefulness=Awake，未发现Whip/Herdr唤醒锁标签。通知开关原配置保留，未发测试agent消息，因此不能证明通知完整性。原微信IME已恢复，私密临时截图与UI XML（主机和设备）已删除。精确回放命令暂留`/dev/shm/whip-replay-command.txt`供新版复测，负载程序已正常结束，独立workspace保留空闲。USB stayon=2由主agent最终恢复0。

### 原始数值样本（供重算，不重新测量）

`stat` 原始utime+stime累计ticks，100ticks/CPU秒；时间为主机单调钟秒。该PID只适用于旧版进程，新版需重新确认PID。

|点|主机单调秒|Whip PID28589 ticks|WebView PID28893 ticks|
|---|---:|---:|---:|
|Send前|1261630.275874701|129642|19883|
|30s|1261660.438399222|131368|20218|
|60s|1261690.513247203|133363|20729|
|90s|1261720.626631235|135329|21241|
|120s|1261750.722790388|137316|21779|
|150s|1261780.805060823|139294|22284|
|180s|1261810.957737732|141275|22806|

重算稳态：时长1261810.957737732−1261660.438399222=150.519338510秒；Whip(141275−131368)/100=99.07秒；WebView(22806−20218)/100=25.88秒。

Home后台原始：起点1261908.778592972、Whip145287ticks、WebView23470ticks；终点1261939.057311291、Whip145558ticks、WebView23472ticks。
