# UPDATE

日期：2026-09-18

本次修改目标：让 Whip 更适合 Bigme B1051C（10.3 英寸 E-Ink 平板），并生成可安装的 ARM64 Android Release APK。

## 已完成的修改

### 2.3 Logo 源文件统一（build 245）

- 应用内 `WhipMark`、Expo 应用图标、iOS AppIcon 和 Android 启动图标统一改用 `assets/whip-logo.svg`；该设计为机器人、终端窗口和 `Whip` 字标组合，使用浅灰圆角底和深灰图形，保留 E-Ink 可辨识的高对比度。
- Android 图标不再把 SVG 强行解析为旧的路径型 VectorDrawable；`scripts/generate-android-launcher-vector.mjs` 会用 Sharp 从同一 SVG 生成 PNG 前景，再由自适应图标引用，避免 `<text>`、圆形和矩形在 Android 图标中丢失。
- 修改 Logo 后必须运行 `node scripts/generate-android-launcher-vector.mjs`，并重新生成 `assets/icon.png` 及 Android 各密度启动图标；不能只替换应用内 `WhipMark`。build 245 已包含并验证新的 Logo，但尚未进行 Bigme 真机图标验收。
- APK：[app-release-245.apk](android/app/build/outputs/apk/release/app-release-245.apk)，`1.7.0` / versionCode `245` / `arm64-v8a` / minSdk 24；`106,495,007` bytes；SHA-256：`50509e5d507aa4d9fc165b3ec00030845cd22cbca8f0ec028240a319ff9be5ab`。已通过 ZIP CRC、APK v2 签名、zipalign、Manifest/ABI 检查；使用预览签名与跳过 R8 的本地测试配置。

### 2.4 三行导航紧凑高度（build 245）

- Workspace、Tab、Pane 三行的文字、状态图标、芯片和固定按钮适当缩小；三行高度调整为 40/48/40 dp，Tab 行仍保留略高空间以容纳关闭和新增按钮。`terminalSessionChromeHeight` 已同步更新，终端正文和底部控制栏不会继续使用旧的三行高度。
- 只压缩导航栏，不改变 Workspace/Tab/Pane 的原名称、横向滑动、选择、关闭确认、加号和 Agent/普通 Pane 分组逻辑；触摸区域仍保持可操作尺寸。
- 本轮通过 TypeScript、SessionScreen/floatingChrome ESLint、Session/输入相关 118 项 Jest 测试；Android Release 构建成功，Metro bundle 已确认包含新 Logo 引用。

### 2.1 链接误触与省电优化（build 241）

- 用户在 build 240 后反馈：终端输出中有网页链接，滚动后点击其它位置或输入区也可能打开网页。本轮按用户指定由 Luna xhigh 修复链接并实施已批准的省电方案，主线程审阅/要求修正后由 SOL medium 编译；已生成并验证本地测试包，尚未完成 Bigme 真机验收。
- 链接编号映射随历史 marker/终端生命周期回收；已用安装的 xterm 验证 OSC-8 字符元数据在擦除后消失，并用生成运行时验证完整的滑动/点击事件。Android/iOS 终端资产必须从源脚本重新生成后再打包，不能只改生成 HTML。
- 链接阶段已完成代码审阅：坐标越界返回空而非夹到边缘；按当前滚动位置及实时 OSC-8 字符属性定位；触摸结束/取消重新抑制合成 click，避免超过 750ms 的长手势绕过保护；已有鼠标拖动在区域外松手仍配对释放。生成运行时测试必须提供浏览器 `URL` 全局，否则链接解析中的 catch 会吞掉测试环境的 ReferenceError，产生假的“未扫描到链接”。Android/iOS 运行时均已验证长滚动后的合成 click 不激活、真正链接只激活一次。尚不能等同 Bigme 真机触摸验收。
- 编译注意：本轮 Rust 监控和 Chat API 有变，必须重新编译 ARM64 Rust 并生成 UniFFI 的 TS/C++ 绑定，禁止沿用 build 240 的 `-x :react-native-whip-ssh:buildRustArm64`。审阅手写源码/测试后再编译生成绑定，随后重新执行 TypeScript 和相关测试；不要靠类型断言隐藏过期绑定。构建使用 `EXPO_NO_DOTENV=1`，禁止自动加载敏感环境配置。不得把编译完成或单次内存快照当作实测省电比例。
- 真机回归清单：安装后先核对实际 versionCode；① 输出含中文前缀/OSC-8 的链接，长滑动后点空白、Codex 输入区及 composer，再直接点可见链接；② 静止阅读、持续输出、快速切换三行导航、切到后台再返回，核对正文与光标没有丢失；③ 正在写入大 Chat 缓存时隐藏/恢复，观察 `cacheWriteQueued`、native heap/PSS 趋势；④ 分别测试平衡省电/实时提醒和主动语音朗读；⑤ 同亮度、Wi-Fi、刷新模式与内容下比较 CPU/唤醒及耗电。当前 `adb devices` 无设备，尚未执行这些 Bigme 验收步骤。
- 已接入后台电源偏好 `backgroundPowerPreference: auto | balanced | realtime`，旧偏好迁移默认 `auto`；E-Ink 自动解析为 balanced，普通屏为 realtime，用户可手动覆盖或选回自动。Android 前台服务按当前模式调整 CPU wake lock；balanced 不长期持有监控锁，显式语音朗读仍保留自己的唤醒需求。模式切换、语音所有者交接和只停止监控时不能误停正在播放的新语音会话。自动模式的说明也须告知通知可能延迟、返回时可能重连。
- Rust 主机监控由固定 1 秒 tick 改为按下一次到期时间或生命周期事件唤醒。普通屏保留健康检查 15 秒、Hosts 延迟采样 3 秒；E-Ink 分别为 60 秒、15 秒；定期状态校正仍为 120 秒，健康检查发现 stale/needs_resync 时仍及时校正。前台恢复/Hosts 变为可见会立即触发检查；后台等待不强持有 RuntimeInner，Notify 先注册再检查状态以避免丢失唤醒。未改变 SSH 传输保活间隔。
- 缓存审阅新增回归要求：暂停/恢复的同步世代与持久化确认生命周期分开；SQLite 旧写入确认迟到时，应释放对应的待写名额并补发最新已完成内容，不需要再等下一条消息。不能仅靠 offset 判断对应关系：源重建后相同 offset 的旧确认不得释放新快照的名额。页面消费者与语音消费者必须独立计数，原生有效活跃状态取二者的 OR，未变化状态不重复跨 FFI 调用。
- 链接最终实现还修正了中文双宽字符、emoji 和组合字符导致的 JS 字符串位置与终端列号不一致；点击范围使用真实 xterm cell 列映射，查询仅扫描点击附近有界的行区间。纯链接测试使用实际安装的 xterm 字符元数据，不能用字符串长度代替终端列宽。此前左右 16px 阅读边距保留。
- E-Ink 隐藏/非选中的 Herdr Pane 释放 SCREEN 订阅，回到前台只连接选中 Pane 并获取完整 baseline；迟到的 ready/resize 不得重新连接隐藏 Pane。隐藏整个终端宿主时取消 WebView 中所有 Pane 的呈现，但保留缓存 xterm 状态；直接 SSH 流不因隐藏而断开或丢字节。输出合并窗口 100ms，按 64KiB 或 32 个待写脚本阈值立即刷新；完整重绘、输入回显/resize、方向/滚动操作和显示模式切换刷新队列，保证顺序与输入响应。直接 SSH 字节流保持原有即时解析路径。
- E-Ink 离线预览仍在首次空闲约 3 秒后保存；后续空闲序列化最短间隔 30 秒，未改变的内容不重复发送/保存，失败保留 dirty 标记，隐藏/回收时按需立即补存。上限仍是序列化前 500 行，普通模式保留原有策略。异常杀进程可能丢失最近尚未保存的本地预览，不影响远端会话原始内容。
- 验证：最终源码及重新生成的原生绑定通过完整 TypeScript 检查、25 套定向 Jest/388 项（涵盖链接、终端、方向键、键盘、Chat、语音、偏好、启动和原生接口适配）、相关手写 TS/TSX ESLint、生成终端资产一致性与 diff 空白检查。Luna Rust `agent_sessions::tests` 28 项、monitoring 4 项通过。`setMonitoringState` 的第 4 个 `isEink` 参数和 `setAgentChatActive` 已由 SOL 生成到 UniFFI TS/C++，没有用类型断言或声明合并掩盖旧接口。ARM64 Rust、最终 Metro bundle 与 Android APK 均已重编；主线程复核 ZIP CRC、v2 签名、zipalign、Manifest、文件大小/SHA-256，以及包内 HTML 与生成源逐字节一致。临时 Gradle init script 已移除，旧 APK 保留。
- 发布前二次审阅修正：`beginTerminalInputTrace` 在未开启 Perfetto 时返回 null，不能把 trace cookie 当作正常使用时“正在输入”的判断依据。输入/方向/滚动现在触发独立的 500ms 即时刷新窗口，不新建周期性 timer；窗口结束后恢复普通输出合并。诊断关闭时实际调用 renderer.input 的回归已通过，最终 Metro 必须打包此修正。下次优化也须测诊断关闭的实际路径，不能只 mock 一个非空 trace cookie。

### 2.2 终端方向键与键盘按钮外观（build 244）

- 方向键滑动区域不再使用 E-Ink 控制灰背景，恢复为与终端控制栏一致的透明底、细边框和圆角；保留 PanResponder 滑动、无障碍方向操作和原触摸尺寸。
- 键盘按钮改为透明 Ghost 控件，取消普通背景和启用时的填充背景；启用状态仍通过边框和图标颜色表示，不改变键盘弹出、焦点或输入逻辑。
- Pane/Tab 的关闭入口现在统一先显示确认框；取消 Herd 中滑动关闭 Agent Tab 的确认时，会恢复被暂时收起的行。Workspace 原有的关闭确认保持不变。
- 关闭确认框不再使用全屏半透明黑色遮罩，点击关闭时直接显示确认框，避免 E-Ink 屏幕出现难看的整屏灰闪；透明遮罩仍保留点击空白处取消和弹窗交互拦截。
- 方向键外框改为与 Home、键盘、Tab 控件一致的明显圆角，仍保持透明背景和细边框。
- 终端固定功能区与可滑动功能区之间取消竖向分隔线；Workspace、Tab、Pane 三行之间取消横向分隔线，只移除边框，不改变原有高度、内边距或滚动区域。
- 本轮只改终端控制栏 UI、确认框遮罩及方向键外观，未改变终端协议或方向键行为；已通过 TypeScript、相关 ESLint、方向键/终端控件及 SessionScreen 定向测试。build 244 已重新打包 Metro、ARM64 原生库和 Android APK。
- 最新 APK：[app-release-244.apk](android/app/build/outputs/apk/release/app-release-244.apk)，`1.7.0` / versionCode `244` / `arm64-v8a` / minSdk 24；`106,794,547` bytes；SHA-256 `0e98e32d978ed487c4fd2f2e766cef74a415ab2f4a769418f532a63d51cd2777`。已通过 ZIP CRC、APK v2 签名、zipalign、Manifest/ABI 检查。这是预览签名、跳过 R8 的本地测试包，尚未进行 Bigme 真机触摸验收。

### 2.0 Terminal 阅读边距（build 240）

- 用户在 Bigme 上用 `cat` 查看长文时，正文从屏幕最左侧开始，右侧换行处也几乎贴边。根因是 `scripts/sync-terminal-assets.mjs` 生成的 xterm 样式只设置 `height: 100%`，没有水平内边距；与 `cat` 命令、SSH 内容或字体颜色无关。
- 给实际 `.xterm` 元素添加左右各 16 CSS px 的内边距，而非仅移动外层容器。现有 FitAddon 与 `measureEffectiveTerminalGeometry` 都会扣除该元素的内边距计算列数，远端 PTY 可按新的列宽换行，不会把右侧字符藏在屏幕之外；触摸定位继续使用 `.xterm-screen` 的真实边界。Android 和 iOS 终端 HTML 都必须通过 `node scripts/sync-terminal-assets.mjs` 从脚本重新生成，不要只手改其中一个生成物。
- 新增生成资源与列宽回归测试；左右各 16px 会按 8px 单元宽度将 400px 测试终端的列数减少 4 列，并向上层报告新尺寸。全量 Jest 146 套/1124 项、TypeScript、测试文件 ESLint、脚本 Node 语法检查、终端生成资产一致性均通过。该生成脚本原有的动态 `import` 无法被当前 ESLint 解析，因此未把对脚本运行 ESLint 当作验收项。
- 编译时须先运行 `node scripts/sync-terminal-assets.mjs`；Android APK 内的 `assets/herdr-terminal.html` 要包含上述 16px 样式，避免只更新源码而分发旧 HTML。本轮 Rust/UniFFI 未变，沿用 Gradle 8.13、ARM64、预览签名、`skipR8`，可跳过 Rust 重编。Bigme 真机视觉效果仍需安装 build 240 确认。

### 1.9 全屏输入框打开时控制栏仍被键盘遮住（build 239）

- build 238 的 Bigme 截图显示：浮动 composer 在键盘上方，但方向键所在整排控制栏仅露出上缘。说明上一轮 `onFocus` 后重新调用 `measureInWindow` 仍依赖不准确/滞后的 React Native 键盘 frame；只重测同一个 frame 不能纠正位置。该 Terminal 会开启全屏，打开 composer 时原生窗口还会切换为 `SOFT_INPUT_ADJUST_NOTHING`，键盘本来就允许盖住窗口。Android 文档说明全屏窗口可能忽略 `adjustResize`，因此不能仅把窗口模式切回 resize 当作可靠修复。
- Android `HerdrSoftInputModule` 新增 `getImeTopInWindow`：在 UI 线程读取 `rootWindowInsets` 的 `Type.ime()`，按显示密度换算为 RN 使用的 dp，返回当前窗口坐标内的真实键盘顶部。Android 11 以下、键盘未显示或 Insets 暂不可用时返回 null，保留旧 RN frame 计算作为降级路径。没有读取或触碰任何 SSH 密钥。
- `useKeyboardInset` 在收到键盘 show/frame 与视口布局变化时先用 RN frame 即时计算，再以原生 IME 顶部异步校正同一个 inset；composer、控制栏、Session 三行导航和终端底部预留由这一 inset 驱动。用测量修订号丢弃键盘已隐藏、窗口已切换或组件卸载后的迟到回调。TerminalScreen 接入原生读取；其它页面仍保持原行为。
- 新增“RN frame 误报没有遮挡，但 native Insets 表明实际遮挡”的 hook/TerminalScreen 回归测试，以及键盘隐藏后迟到回调测试；键盘隐藏时不查询原生 Insets，以免普通布局变化产生额外桥接调用。全量 Jest 146 套件/1122 项、TypeScript、修改文件 ESLint、终端资产检查通过。当前 `adb devices` 没有连接设备，**不能声称 Bigme 真机已修复**；下一次请安装 build 239 重现同一步骤，确认方向键整排可见且可按。若仍被遮住，应采集同一时刻的原生 IME Insets、RN `keyboardDidShow` 的 `screenY` 与 `measureInWindow` 的 y/height，排查厂商输入法额外浮层。
- 本轮修改了 Android Kotlin 桥接模块，必须执行 Android 原生编译并生成新 APK；仅更新 Metro JS bundle 不会包含 `getImeTopInWindow`。Rust/UniFFI 未变，可跳过 `:react-native-whip-ssh:buildRustArm64`。沿用 Gradle 8.13、显式 Android SDK、仅 `:app` 输出到 tmpfs、ARM64、预览签名与 `skipR8` 的本地测试配置。Kotlin 编译与最终 Metro JS 二次打包均成功，APK 最终校验见下方结果。

### 1.8 Workspace 新建入口与 Pane 分组图标（build 238）

- 用户认为 build 237 在 Agent Pane 与普通 Pane 之间的“Pane”文字块过于突兀。本轮去掉带框文字，改用深灰 2dp 分隔线 + 扁平 `SquareTerminal` 图标；保留每个 Agent Pane 前的 `Bot` 图标与普通 Pane 的原始名称、横向滚动，E-Ink 上不依赖颜色辨别分组。
- Workspace 第一行右端新增固定“+”，与 Tab/Pane 的“+”一样置于横向 ScrollView 外。点击后打开与 Herd 新建 Workspace 一致的编辑弹窗，可填可选名称和工作目录；提交调用 Herdr `workspace.create`（`focus: true`），校验 `workspace_created` 结果后立即在本地选择返回的 Workspace/Tab/根 Pane，并等待服务端 snapshot 确认。已有 Workspace 仍可滑动；无 Workspace 但 Herdr 正在运行时，第一行与新建入口仍显示。Herdr 停止时入口禁用，原返回按钮保留。
- 新建成功后暂存刚创建的 Workspace/Tab/根 Pane，避免快照尚未更新就被旧焦点拉回；快照确认后清除暂存。切换 Host 会清除暂存，不混用其它服务器的资源。测试覆盖固定按钮、API 参数、创建后的显示，以及空 Workspace 初始状态。
- 全量 Jest 146 套件/1118 项、TypeScript、改动文件 ESLint 已通过。本轮只改 JS/UI、测试、文档和 Android `versionCode`，Rust/UniFFI 未变；重新打包了 Metro JS。build 238 APK 已通过 ZIP CRC、APK v2 签名、zipalign 和 aapt2 Manifest 验证；Bigme 真机视觉效果仍待验证。

### 1.7 键盘遮挡、三行导航图标及 Pane 新建（build 237）

- 用户提供 build 236 真机初测：安装后进程仍存活，native heap 约 119 MB、TOTAL PSS 约 444 MB、RSS 约 596 MB，暂未见新 `LOW_MEMORY`、ANR 或 fatal exception。这支持此前内存防护有效，但仍应在长时间运行及主动打开大型 Chat 历史后复测，不应把一次快照当作完整稳定性证明。
- 修复输入法已经打开时再进入 Terminal 文本输入框的遮挡：Android `adjustResize` → `adjustNothing` 切换不一定重新触发 `keyboardDidShow`。打开 composer 和输入框获得焦点时，立即并在布局稳定后重测终端视口；底部固定方向键/功能键和输入框按实际键盘顶部一起抬升。重测仍使用最近的键盘显示/帧事件位置，不以可能滞后的 `Keyboard.metrics()` 覆盖 `keyboardDidChangeFrame`。隐藏页面后延迟重测不再执行。
- Tab 行左侧增加固定扁平 Tab 图标，Pane 行左侧增加固定 Pane 图标，两个图标均在横向滚动区域之外；Workspace 行原返回按钮保留。Agent Pane 芯片内增加 `Bot` 图标和原 Agent/Panes 名字，Agent 与普通 Pane 之间改用有填充及边框、标注“Pane”的灰阶分组标签，不再只靠细线。E-Ink 下保持原黑/灰配色和原完整名称横向滚动。
- Pane 行右端固定增加“+”，调用 Herdr 现有 `pane.split`，以当前选中 Pane 为目标向右分割并聚焦新 Pane；没有选中 Pane 或变更进行中时禁用。它不是新建 Tab，也不改动原终端方向键手势。各语言增加对应无障碍标签。
- 增加已打开 IME 的窗口模式切换回归测试、固定图标/Agent 图标/分组标记和 Pane 分割 API 测试。全量 Jest 146 套件/1116 项、TypeScript、改动文件 ESLint 已通过。真机视觉位置和 Pane 分割后的服务端焦点回传仍需 Bigme 实测。
- 本节仅修改 JS/UI、测试、文案和 Android `versionCode`，未改 Rust/UniFFI；APK 构建可跳过 `:react-native-whip-ssh:buildRustArm64`，但必须重新打包 Metro JS bundle。沿用 Gradle 8.13、显式 Android SDK、仅 `:app` 输出到 tmpfs、ARM64、预览签名和 `skipR8` 的本地测试配置。build 237 已完成打包和 ZIP CRC、v2 签名、zipalign、aapt2 Manifest 验证；没有连接 Bigme 真机。

### 1.6 Ubuntu 首次进入即被系统 LOW_MEMORY 杀进程：后台 Chat 预载与 checkpoint 防护（诊断候选 build 236）

- 用户的 Android `ApplicationExitInfo`、`lowmemorykiller` 和 `dumpsys meminfo` 已确认旧包被系统以 `LOW_MEMORY` 杀死，退出前 PSS/RSS 约 2.5 GB、native heap 约 2.1 GB；SSH 已连接成功，没有证据支持 Java FATAL、SIGSEGV 或 ANR 是本次退出原因。用户没有切换任何 Pane：导航栏先显示，终端内容稍后显示，随后进程被杀。因此切换请求不是必要触发条件，也不能把此前 build 234/235 当作已验证修复。
- 2026-09-18 用户进一步确认两次测试的**实际安装版本都是 235**：分别以 `LOW_MEMORY` 退出，PSS/RSS 约 3.4 GB 与 2.5 GB。本次 12:12:08 自动加载了 `69,292,165` bytes Agent 缓存，约 20 秒内 revision 由 976 升至 1027，`viewportMounted=false`，12:12:28 被 LMK 杀掉。build 235 **不包含**本节的懒加载/JS 合并/Rust checkpoint 背压，因此不能以这份反馈判断这些新改动是否有效。
- `SessionScreen` 原先在可见 Agent pane 上自动调用 `agentTranscriptService.preload`，即便 Chat viewport 未挂载也会读取完整 SQLite 缓存并同步 Rust transcript。旧日志中约 62 MB 缓存和大量 `message-upserted`/`turn-upserted` 更新与这一路径一致。现在 E-Ink 模式进入 Terminal 不再自动预载 Chat；用户主动打开 Chat 或已有显式 Chat 恢复意图时仍按原逻辑启动。这牺牲了 E-Ink 上 Chat 的后台预热速度，换取首次进入主机时不加载大历史；普通显示模式保持原行为。
- 同一 transcript 的完整 checkpoint 写入由无界待写副本改为最多一份正在写入和一份最新待写 blob；新 checkpoint 覆盖旧待写 blob，确认只在最新 blob 持久化之后进行，删除/分离仍清理待写引用。此项缓解 SQLite 慢于 Agent 更新时的内存放大，但不限制单次显式 Chat 恢复 62 MB 历史的峰值，也不证明三行导航是唯一诱因。
- 原生 Rust 的 Codex/OpenCode 处理现在同一会话最多只生成一份未确认的完整历史 checkpoint；收到 SQLite 持久化确认后，如果当前游标已经推进，会补发最新 checkpoint，避免最后一轮恰好停在等待期间而丢失持久化进度。`native-update-received` 日志补充 `cacheWriteBytes` 与 `cacheWriteQueued`，下次可直接看到完整 blob 是否仍密集生成。持久化失败仍将 Chat 标为 stale；不要错误确认尚未落盘的数据。
- 已通过 `sessionChatOpen` 和 `nativeTranscriptService` 相关测试（118 项）、Rust `agent_sessions` 25 项及 TypeScript/`cargo fmt --check`；尚未做 Bigme 真机 `dumpsys meminfo` 对比。不要标注“完全修复”或发布为已验证稳定版。下次在真机对比首次进入 Ubuntu 后的 native heap/PSS 与 5–10 分钟趋势，并测试用户主动打开 Chat 后的峰值；如仍增长，继续检查 Rust 缓存恢复/FFI 全量状态拷贝。此前 build 235 不包含本节改动。
- **编译注意**：本节改了 `packages/react-native-whip-ssh/rust/src/agent_sessions.rs`，生成 Android APK 时必须重新编译并打包 ARM64 Rust 库；仅替换 Metro JS bundle 或复用 build 235 的 `.so` 无法验证原生背压。版本号也必须高于 235，安装后先核对 `versionCode`，避免重复测试旧 APK。
- 本机缺少 `clang-format`，UniFFI 的 `ubrn generate` 会改写已跟踪的 C++/TS 生成文件并产生大量纯格式差异；生成的绑定已成功编译到 build 236，C++ 尾随空白已机械清理。下次不要把生成文件的格式噪声误判为手写协议变更，也不要在 Rust 源码变动后复用旧 `.so`。
- 已重新编译 ARM64 Rust 库、UniFFI 绑定和 JS bundle，Gradle 8.13 `:app:assembleRelease` 成功。**诊断候选 APK**：[app-release-236.apk](android/app/build/outputs/apk/release/app-release-236.apk)，`versionCode=236` / `versionName=1.7.0` / `arm64-v8a` / minSdk 24，`106,753,291` bytes，SHA-256 `fe1a0aadc80300c7bca5c86adaddca2b7671773caeed2ed38c9cde1f1454e72f`。已通过 ZIP CRC、APK v2 签名、zipalign、aapt2 Manifest 检查；使用预览签名与跳过 R8，不是正式上架包。`app-release.apk` 的旧路径仍指向旧包，测试时务必选文件名带 `236` 的 APK。
- 设备验收仍未完成：先确认安装的实际 `versionCode=236`，进入 Hosts→Ubuntu，不打开 Chat，观察 5–10 分钟 PSS/native heap；然后主动打开 Chat，再记录 69 MB 历史恢复后的峰值、`cacheWriteBytes` 和 `cacheWriteQueued`。若首次进入不再加载缓存却仍被 LMK 杀，说明还有独立的终端/导航原生内存路径，不能把修复标为完成。

### 1.5 三行导航新增原生视图的 E-Ink 减负（build 235）

- 用户指出退出问题始于三行 Workspace/Tab/Pane 导航；原版已有离线缓存而未出现同样问题。检查发现各行的工作中 Agent 状态图标在 E-Ink 模式虽然禁用了动画，仍实际装载 `NativeAgentSpinner` 原生视图。多个 Pane/Tab/Workspace 同时出现时，这些视图会与终端 WebView 一起创建。
- 工作中/运行中的状态在 E-Ink 或减少动态效果时改为静态符号，不再创建原生 spinner 视图；普通显示模式保留旋转动画。此项专门减少三行导航增加的原生视图成本，仍不能在没有 Android crash stack 的情况下证明它是唯一根因。
- build 234 保留为仅终端缓存缩小的 A/B 候选；build 235 叠加此导航图标修正。用户可优先安装 build 235 验证；若仍回到桌面，必须获取设备 logcat/系统 bug report 才能区分 OOM、ANR、JS Fatal 和原生崩溃。

### 1.4 Ubuntu 会话打开后卡顿/退出的针对性处理（build 234）

- 用户提供的 App 日志显示 SSH 连接成功：Ubuntu 从 `host-connect-requested` 到 `host-connect-ready` 约 1.5 秒，含 8 个 Pane；随后后台另一台主机也成功连接。日志没有 Android `FATAL EXCEPTION`、`OutOfMemoryError`、`ANR` 或进程结束记录，不能据此断言崩溃根因。
- 进一步复现描述是：Hosts 中点 Ubuntu 后导航列表先出现，终端内容较慢才出现，再过一会整个 App 退出。重点检查了终端/WebView 加载路径。发现 E-Ink 的离线预览在输出停止 3 秒后会同步序列化最多 5000 行；原 100 万字符截断在序列化之后，无法限制这一步的瞬时内存/主线程耗时。
- E-Ink 离线预览改为在序列化前最多取 500 行；连接中的 Herdr 终端在 E-Ink 上把 xterm 本地冗余 scrollback 限为 1000 行（远端历史仍由 Herdr 管理），直接 SSH Shell 仍按用户设置保留本地历史。非 E-Ink 行为不变。此变更降低已确认的内存/同步工作风险，但真机闪退是否消除仍待验证。
- 用户补充：此前版本同样使用离线预览，却没有这个退出问题；异常是在加入三行 Workspace/Tab/Pane 导航后出现。因此不能把快照序列化认定为回归根因。build 234 是缩小内存峰值的诊断候选版；如果它仍退出，优先对比三行导航启用/关闭时的原生崩溃栈、WebView 几何和 SessionScreen 状态更新，不要继续仅凭时间顺序调缓存参数。
- 已补 500 行上限与普通模式保持 5000 行的回归测试；生成终端资产后需运行 `node scripts/sync-terminal-assets.mjs --check`。如 build 234 仍退出，请提供 Android logcat/系统 bug report 的 `FATAL EXCEPTION`、`OutOfMemoryError`、`ANR` 或 `lowmemorykiller` 条目及时间，不要只给 App 日志；App 日志在进程被杀时无法记录原生原因。

### 1.3 切换卡顿与内存风险处理（build 233）

- 用户报告切换 Space/Tab/Pane/Agent 卡顿，并退出到安卓桌面。ADB 当前无设备，未取得原生崩溃栈或 OOM 记录，不能认定闪退根因已证实或真机问题已全部解决。
- 有目标 Pane 时只请求一次 pane.focus（原生 host_state 的 focus_pane 已同步其父 Tab/Workspace），不再串行请求 workspace.focus/tab.focus/pane.focus 产生中间选择状态和多次重绘。空 Tab/Workspace 仍请求各自焦点。点击已激活项目不重复激活。
- 用 SessionFocusQueue 替换无限增长的 Promise 链：最多一个执行中请求和一个可替换的待执行选择；快速连点只保留最后一个，切换 host/卸载清除待执行任务，旧请求失败不覆盖新选择。已有本地即时选择行为保留。
- E-Ink 模式的驻留 xterm 渲染缓存最多 3 个，普通模式保留用户设置（默认 20）。先驱逐旧渲染器再创建新渲染器，降低瞬间内存峰值。仅回收本地渲染器并分离桥接控制器，不关闭远端 Pane/Agent/任务；返回更早的 Pane 需要重新渲染。此前缓存偏好值仍保留，E-Ink 实际执行上限为 3。
- 选择记忆清理由嵌套过滤改为线性 Map 索引，缓存排序及 pending 资源计算。新增 WebView 渲染进程退出诊断事件，仅记录崩溃标志、驻留数量及 E-Ink 标志，不记录终端文本；这些日志不能捕获整个 Android 进程被杀死的所有情况。
- 增加 1 万次快速选择/请求失败/清理队列、单次焦点请求/重复点击、E-Ink 容量与先回收再分配的组件回归测试。方向键及三行原名称横向滚动代码未改变。真机切换性能和退出问题仍需使用验证。
- 本轮全量 Jest 146 套件/1108 项通过，TypeScript、修改文件 ESLint、资产一致性和 diff 空白检查通过；这不是内存峰值或 Android 原生崩溃实测。

### 1.2 三行原名称显示与横向滚动（build 232）

- 修复 Space 与 Pane/Agent 标签的布局：无固定宽度的横向 ScrollView 子项不能用 `flex-1` 挤占“剩余宽度”，否则名称可能被压缩。改成按内容测量、`shrink-0`，移除三行标签及文字的最大宽度/裁切；保留单行，超长名称通过整行横向滑动查看。
- Space 按钮与外框统一 44dp，避免 36dp 外框裁切原生按钮的 44dp 最小高度。Pane 行明确占用剩余宽度，使其内容溢出时由 ScrollView 滚动。
- 继续直接使用服务器 Workspace/Tab 的 label、Pane 的 label/title；Agent 优先使用 display_agent，未命名 Pane 最后回退 pane_id，不再把所有无名称 Pane 都显示为 shell。
- 本次没有修改方向 pad、固定功能键顺序或其事件响应器。新增长中文/英文名称和三行内容宽度约束回归测试；测试不等同 Bigme 真机布局验证。构建/校验结果见下方当前 APK 信息。
- 验证：全量 146 套件/1102 项通过，TypeScript、修改文件 ESLint、生成资产一致性通过。注意不要重新给横向标签按钮加 `flex-1`，也不要给其文字设置最大宽度后用 overflow-hidden 裁掉原名称。

### 1.1 三级导航与选择状态修复（build 231，按用户要求先行交付）

验收状态：用户明确要求“先发布，我先使用”，由主线程编译交付 build 231，不是全部需求已完成。Luna/Astra 已停止。主线程补充真实组件交互测试并修复跨 host 返回时输入目标未恢复、旧 host 请求阻塞和删除后的选择意图残留；空 Workspace/Tab 不会被旧焦点拉回。此前三组全量测试失败已解决。真实 Codex 尚无编辑区域 producer，硬换行点击仍未修复；不得将协议夹具测试通过等同真实 Codex 功能完成。详见 REVIEW.MD。

主线程最终回归检查：覆盖主动选择空 Workspace/Tab、旧 snapshot、删除后恢复和 A→B→A 的输入目标恢复；全量 Jest 146 套件/1100 项通过（`--runInBand --silent --no-cache --watchman=false`，扫描排除密钥路径），TypeScript、本轮修改文件 ESLint、终端生成资产一致性及 diff 空白检查通过。未连接 Bigme 真机。未来启用真实 Codex 输入定位前仍须接通 producer 并核查预留 API 的 target/generation/revision 生命周期；本次部分发布不代表该项验收通过。

- `SessionScreen` 底部会常驻三层选择栏：Workspace、当前 Workspace 的 Tab、当前 Tab 的 Pane。Workspace 选择栏没有关闭按钮；Tab 仍保留切换/关闭/新建；Pane 即使只有一个也保持可见。每层使用独立横向滚动区，键盘、composer 和输入法占用空间由 `terminalSessionChromeHeight` 统一计入，正文不会覆盖导航栏。
- Workspace 和 Tab 使用服务器编号排序，避免 Agent 状态变化导致标签跳动；组件按 host 隔离缓存两个独立关系：Workspace → 最近 Tab、Tab → 最近 Pane。切换时先本地选中并激活对应 Pane，再按 Workspace → Tab → Pane 顺序发送 focus 请求；删除资源、空 Workspace/Tab、延迟 snapshot、异步 server focus 和 host 快速切换不会复用其它 host 的选择。
- Pane 行按 Agent Pane 优先、普通 Pane 后置分组，使用分隔线且每个 Pane 只出现一次。普通显示模式按 Agent 名称稳定分配不同强调色；E-Ink 使用深灰点标识和黑色/深灰文字，不使用浅灰字或彩色依赖。Agent Pane 标签同时显示 Agent 名和 Pane 名。
- `terminal-touch-behavior.cjs` 不再从 alternate/primary、提示符字符或最近 12 行推断编辑区。软换行仍可在当前逻辑行内左右定位；鼠标跟踪/强制鼠标仍交给 TUI；硬换行上下定位只有在应用明确提供 `source: application`、`mode: line-editor-clamped`、完整 `startRow/endRow` 和与 xterm 当前光标一致的状态时才启用。该协议在 primary/alternate 都适用，缓冲区切换、reset 会清除状态。
- `TerminalRendererHost`/WebView 增加 `setEditableRegion`、`herdrSetEditableRegion` 和 `herdrClearEditableRegion` 接口，供未来的 Codex 应用适配层发布可验证区域。垂直移动按每个实际渲染行的有效列模拟短行裁剪，再以宽字符单元修正水平位置；支持首/中/末行、空行、上下双向及超过 12 行。没有应用协议时点击硬换行区域安全地不注入方向键，因此不会误触 shell 历史、引用输出或菜单。
- 新增的 `test-fixtures/codexTerminalReplay.fixture.ts` 是 synthetic、无凭据的协议夹具，不是实际 Codex 录制。它覆盖 primary/alternate、引用样式输出、鼠标协议关闭时的安全拒绝；真实 Codex 要实现硬换行点击，还必须由 Codex/适配层在编辑状态变化时调用上述接口。当前仓库没有发现可直接证明 Codex 编辑区边界的既有远端协议，不能把通用终端的安全拒绝称为真实 Codex 已完全支持。
- 本阶段新增/调整测试覆盖：交互式 Tab 选择及空/删除 Pane 的 activeTarget 清空、Workspace→Tab→Pane 分层缓存、host 同 ID 隔离、延迟 focus、稳定 Workspace/Tab 顺序、Agent/普通 Pane 分组与 E-Ink 颜色、三行导航高度、软换行、显式硬换行、中文/宽字符、空行/双向/长范围和鼠标输入路径。用户允许先行使用后，versionCode 递增为 231 并生成本地 APK，未推送代码或创建远程 Release。

### 1. E-Ink 显示配置

- 新增 `src/lib/displayProfile.tsx`，提供 `auto`、`normal`、`eink` 三种显示配置。
- `auto` 模式会读取 Android `Platform.constants`，识别 `b1051c`、`bigme` 等设备标识；B1051C 默认进入 E-Ink 模式。
- 设置页面增加 Display profile 选项，用户可以手动覆盖自动识别结果。
- E-Ink 模式使用纯白主体背景和高对比灰阶主题：主要正文为 `#000000`，次要文字/状态/边框使用 `#222222` 至 `#777777` 的深灰，避免浅灰文字在墨水屏上发虚。
- 在 E-Ink 模式关闭或缩短主要 UI 动画、弹窗过渡、加载动画和 Ripple/视觉提示；同时支持系统的 reduced-motion 设置。
- E-Ink 模式关闭玻璃模糊、阴影、透明背景和动态背景。
- 早期 Spinner/动画帧率在 E-Ink 模式降为 1；build 228 进一步停止装饰动画的帧回调与原生 spinner。终端光标默认不闪烁。
- 终端使用不透明背景，减少刷新区域和残影；终端脚本/字体资源同步仍由 `scripts/sync-terminal-assets.mjs` 管理。
- 进一步修复终端黑底问题：xterm 切换到 E-Ink 主题后强制刷新可见行，并将 WebView、xterm viewport/screen 及终端容器统一设为 `#ffffff`；同时扩展 Bigme 设备识别字段到 Device/Product/Hardware/Fingerprint。
- E-Ink 颜色改为白底灰阶：`terminal-*` Tailwind 颜色改为主题变量，终端主背景保持纯白，工具栏/卡片使用很浅的灰阶，文字按主次信息使用黑色和深灰，避免继续使用硬编码 Tokyo Night 深色背景。
- ANSI 输出中的彩色文字在 E-Ink 模式映射到可读的深灰阶；Git 差异预览禁用 Android `removeClippedSubviews`，差异行保持不透明白底，并以黑色/深灰区分类型，避免移动后才重绘、留下深色残影。
- 首页服务器/workspace 激活标签以及 Terminal 的 tab/pane 激活标签统一使用较浅但可辨认的中性灰 `#D4D4D4`，E-Ink 下使用不透明填充避免在白底上被冲淡，激活文字、关闭图标和聚合图标使用纯黑；普通显示模式仍保持原来的主题色。
- Terminal 的 “Edit a command or message before sending” 输入框在 E-Ink 下强制使用纯白背景和纯黑文字；周边附件、展开、发送、关闭四个按钮统一使用略深于 tab 的中性灰 `#CECECE`，发送图标也使用纯黑。
- 修复 E-Ink 与 App Glass 偏好同时开启时首页服务器/Workspace 标签仍走透明玻璃样式的问题；E-Ink 现在优先使用白底、`#D4D4D4` 激活填充和灰色边框，不再被黑色主题色覆盖。
- Terminal/xterm 在 E-Ink 模式启用 `minimumContrastRatio: 21`，并关闭加粗文字自动切换到 bright ANSI 色，处理 Codex TUI 的 ANSI 24-bit/加粗输出，确保白底上的主要字体最终使用纯黑。
- 终端写入层会在 E-Ink 模式移除 ANSI 前景/背景色、24-bit 色和反色控制，只保留文字样式；同时兼容传统分号格式和 `38:2::r:g:b` 形式的 colon SGR，这样 Codex 即使主动发送彩色背景，也不会覆盖终端白色底色。
- 修复直接 SSH Shell 的输出丢失：native SSH 回调传递的是 `ArrayBuffer`，旧代码的 UTF-8 分支只接受字符串并静默丢弃输出；现在将原始字节安全地转成 base64 跨越 React Native/WebView，再由 xterm 解码和渲染。该修复同时适用于 E-Ink 和普通显示模式。

注意：本次没有加入厂商私有的 E-Ink 硬件刷新 API，也没有实现额外的硬件按键映射；这两项按本次需求明确保留为后续工作。

### 2. 10.3 英寸平板布局

- 底部导航在平板上改为更适合横向空间的左侧垂直导航栏，触控区域和文字标签保持可用尺寸。
- Workspace/Live Session rail、Session 页面和 More 页面增加平板间距、最大内容宽度和安全区域处理。
- Android `AndroidManifest.xml` 开启 `resizeableActivity`，支持窗口尺寸变化和分屏布局。
- 终端、编辑器、文件管理器和各类弹窗统一检查了 E-Ink 下的透明层、动画和可读性。

### 3. 代码与构建辅助修改

- `src/services/devicePreferences.ts`、`src/hooks/useDevicePreferences.ts`、`src/theme.ts` 和 `global.css` 增加显示配置、设备偏好和 E-Ink 主题支持。
- `src/components/AppShell.tsx` 提供全局 `DisplayProfileProvider`，各组件通过统一 profile 判断是否使用 E-Ink 行为。
- 更新英文、简体中文、繁体中文、西班牙文、日文设置文案。
- 更新显示配置和设备偏好测试；本次 review 时 TypeScript、ESLint、Jest 均已通过。
- `packages/react-native-whip-ssh/rust/build-android.sh` 增加 Android SDK/NDK 自动发现，并兼容版本化的 ARM64 clang/ar/ranlib 路径。

## 构建结果

### 固定主按键与右侧滚动工具栏（build 230）

- 左侧固定顺序：Home → 键盘开关 → 文本输入框（compose）→ Tab → Esc → 方向 pad。固定区不在 ScrollView 内，flexShrink=0，右侧细分隔线区分两个区域；方向 pad 保留 build 229 的普通 View/显式 style，不能改回 active 类。
- 其它按键在右侧独立水平 ScrollView 中。`scrollableTerminalControls` 排除所有固定键和已合并的四个箭头，根据持久化使用次数降序排序，同次数保持默认稳定顺序；鼠标按钮不再被固定到键盘后。
- 改为从最新 controlUsage useMemo 计算滚动区顺序，避免旧代码只在组件首次挂载时读取频率。固定键即使计数很高也不会进入滚动区或改变自身顺序；仍兼容原有使用次数存储。
- 新增纯函数与组件布局测试：固定顺序/无重复、方向按钮不属于滚动区、使用次数变化时右侧重新排序但左侧不变。面向 10.3 英寸平板，不缩小固定键来塞入极窄窗口；非常窄的分屏下右侧剩余空间会受限。
- 8 个相关测试套件共 85 项通过，包含真实样式 interop、方向手势、固定/滚动分区、终端输入、renderer 和键盘几何；TypeScript、修改文件 ESLint、生成资产一致性与 diff 空白检查通过。真机触屏布局仍未实测。

### 方向控制无效的样式响应器冲突（build 229）

- build 228 移出了横向 ScrollView，但方向 pad 仍复用了 `TERMINAL_ICON_CONTROL_CLASS`，其中 `active:bg-card/70` 导致 NativeWind 把 View 升级为 Pressable。Pressable 在原 props 之后展开 Pressability eventHandlers，覆盖 PanResponder 的 onResponderGrant/onResponderMove；因此单独直接调用拖动回调的旧测试通过，设备拖动却无效。
- pad 改为普通 View + 显式 style，不再包含触发自动升级的 active/hover/focus 类；保持 44×36dp、中性灰和边框，图标子树 pointerEvents=none。仍固定在 ScrollView 外。
- 新增 `terminalDirectionPadInterop.test.tsx`，保留真实 CSS 编译、NativeWind interop 和 Pressability，检查修复后的宿主响应器未被替换；旧 active 样式作为正对照，确认会替换 grant/move。测试仅替换原生 View 宿主、图标、主题和 JSX pragma 诊断；不要再把 interop 整层 mock 掉。RN 的 memo 组件可能在 test-renderer 中被展开，判断最终宿主 handler 比 findByType(Pressable) 更可靠。
- TerminalScreen 集成测试实际模拟右/左/上/下拖动，验证 renderer.input 收到 ESC[C、ESC[D、ESC[A、ESC[B；与方向逻辑、renderer、输入协议测试合计 57 项通过。
- Release 229 已通过 ZIP CRC、apksigner v2、zipalign、aapt2（versionCode=229）校验；未连接 Bigme 真机，不能将测试宿主验证等同厂商触屏实测。

### 输入/弹窗、方向按钮、启动与省电修复（build 228）

- 方向按钮从横向 `ScrollView` 中移出，固定在工具栏左侧；按钮为 44×36dp，与其它图标按钮一致。原生滚动不再拥有该按钮所在区域，PanResponder 同时捕获按下并阻止原生 responder 抢占。不是仅靠 `onPanResponderTerminationRequest`：build 227 的旧结构仍会被横向滚动抢走。
- 隐藏 TerminalScreen 不再全局 `Keyboard.dismiss()`；禁用隐藏 renderer 的输入，不影响前台 pane/搜索输入。AppState 仅在离开前台时清理焦点，不在恢复前台时立即收起输入法。
- composer 打开/关闭使用操作序号；切换 pane、隐藏、卸载会让尚未完成的异步操作失效。延迟 focus 检查当前 pane、可见性、键盘开关和 composer 状态；隐藏 composer/history 不再继续显示 Portal/Modal。
- `useKeyboardInset` 监听键盘 frame 变化并提供 `remeasure`，在根 View 的 onLayout 重新测量，处理 Android adjustResize/adjustNothing 切换后旧遮挡高度仍被重复扣除的问题。展开输入框测量自己的 Modal 窗口，而不是复用主窗口的键盘占用。
- E-Ink 的 SSH 字节输出使用持续的 UTF-8 decoder，避免中文/emoji 跨数据包时乱码；普通偏好更新不再清空未完成 ANSI 序列。仅显示模式首次配置/切换时重设主题及整屏 refresh，减少无关设置引起的重绘。
- 启动：`App` 在字体加载阶段就开始一次性本地配置读取，避免先等字体再读磁盘。Metro 开启 inlineRequires，推迟未使用模块的求值；保留原 transformer 其它选项。这里确认的是代码路径优化，未测得 Bigme 冷启动秒数，不能把打包耗时视为启动耗时。
- 省电：E-Ink 停止装饰动画的 Reanimated frame callback 和原生 spinner，而不是只设 1fps；普通显示模式下退到后台也停止装饰 frame callback。离线快照空闲合并窗口在 E-Ink 从 750ms 增至 3000ms，退出/回收强制保存仍立即执行；异常退出可能少保存最后约 3 秒的离线预览，不影响远端会话数据。
- 保留用户选择的常亮设置、SSH 保活、连接健康检查与后台通知，没有为了省电断开连接。当前未连接 ADB 设备，不宣称真机手势、所有输入法或电量下降比例已验证。
- 自测覆盖：方向按钮尺寸/滚动容器归属/四向步进；隐藏 pane 键盘隔离；延迟打开与切换竞态；展开/收起输入框；键盘 frame、窗口布局、过期测量；字体未完成时配置已启动且只读取一次；E-Ink/后台动画停止；快照合并/退出保存；中文逐字节解码；终端点击、输入、resize、剪贴板和生成资产。

下次修改重点：不要将方向 pad 放回 ScrollView；不要让后台终端调用全局收键盘；不要用主窗口尺寸推算原生 Modal 的键盘遮挡；不要让每次配置变更重置流式解码/ANSI 片段。组件测试只能证明事件/状态逻辑，无法证明 Android 原生触摸拦截和厂商输入法的全部行为。

### 滑动方向按钮与点击唤起输入法（build 227）

- 新增 TerminalDirectionPad，用一个按住滑动按钮替代工具栏四个方向键；每拖动约 18dp 发送一次主轴方向键，持续拖动可连续移动，松手/取消结束。原 up 位置作为合并按钮位置，保留偏好存储兼容。
- 按下即取得手势响应，避免与横向工具栏滚动争抢；中心轻触不发送方向键，支持辅助功能四方向动作。
- WebView 对当前光标行/软换行范围的静止单击发送 keyboard-request；原生层仅接受当前 pane 请求，在连接且未打开浮动 composer 时启用输入并请求焦点。长按、滚动、链接和离线内容不触发该请求。
- TypeScript、相关组件 ESLint 和触摸/资源/renderer 测试通过；需真机验证 IME 实际弹出和滑动灵敏度。

### 保留 tab/pane 选择栏（build 226）

- 删除直接键盘弹出时隐藏 session chrome 的条件，tab/pane 选择栏在键盘、浮动输入框打开/关闭时均保留。
- TerminalScreen 将键盘、工具栏和浮动输入框的实际总占用高度回传 SessionScreen；选择栏以该高度作为 bottom，同步移到输入区上方，并使用不透明主题背景。
- 只由可见终端更新位置，避免后台保留的终端覆盖前台布局；终端视口继续预留选择栏高度。
- TypeScript、13 项浮动布局/键盘测试通过。需真机检查打开键盘、打开/关闭浮动输入框后选择栏是否可见、可点击切换。

### 终端单击移动光标（build 225）

- 键盘打开时原 touchend 只 focus，未将单击交给鼠标协议或行编辑器。现在启用鼠标跟踪/强制鼠标时分发点击；其它情况下按点击的 buffer 单元格发送左右方向键，支持 application cursor keys。
- 后备定位仅限当前光标所在逻辑行及软换行，按单元格宽度将中文双宽字符计为一次移动，并限制尾部空白；不会为历史输出发送上下方向键。未启用鼠标的 TUI 手动多行输入（非软换行）不能可靠推断编辑区，因此不支持跨这些行定位。
- 无软件键盘时同样支持后备定位；保留链接优先、长按选择、拖动滚动和双击快捷动作。输入由远端编辑器处理，Shell 行编辑关闭或编辑器重绑定方向键时不保证定位。
- 新增定位测试覆盖左右移动、空白范围、历史输出、自动换行、中文宽字符及应用光标模式；连同已有触摸/资产测试共 18 项通过。真机 Shell/Codex 验证仍待安装。

### 底部遮挡修复（build 224）

- 旧布局在 composer 打开时将布局键盘占用设为 0，并故意保持 PTY 几何不变；文字因此可滚入输入框、工具栏及键盘后面。
- `terminalViewportLayout` 现在将键盘实际遮挡高度、工具栏高度和非全屏 composer 实测高度计入真实布局预留；TerminalScreen 使用底部 margin 缩小并裁剪终端/聊天共同视口，同时预留可见 session tab/pane 栏。
- 已预留的高度不再重复计入虚拟滚动 inset；输入框外层和工具栏使用不透明主题背景。终端行数会随可视高度变化，远端 TUI 可能正常重排。
- 覆盖软键盘、硬件键盘、composer 高度变化、关闭和展开状态的几何测试。普通模态对话框仍按模态遮挡交互，不作为可同时滚动的终端区域。

### Portal 主题修复（build 223）

- 根因：`@rn-primitives/portal` 将子节点存储后在 PortalHost 处渲染，不继承调用位置的 React Context 或 NativeWind 变量。旧宿主在 `App.tsx`，位于 `DisplayProfileProvider` 和 `.eink` 之外；浮动输入框因此可能退回普通显示配置和深色终端变量。
- 将唯一的 PortalHost 移到 AppShell 的显示配置 Provider 内，并与页面共用 `.eink` 根 View；保留在 SafeAreaView 外，避免改变浮动输入框的绝对定位。
- 上一轮只递增版本号没有修复此结构问题；包中包含颜色常量不能证明设备渲染使用了这些颜色。需在设备上验证手动 E-Ink、自动识别和切换模式后重新打开输入框的效果。

已生成并验证：

- 最新本地测试 APK：[app-release-244.apk](android/app/build/outputs/apk/release/app-release-244.apk)，`1.7.0` / versionCode `244` / `arm64-v8a` / minSdk 24；`106,794,547` bytes；SHA-256 `0e98e32d978ed487c4fd2f2e766cef74a415ab2f4a769418f532a63d51cd2777`。包含 Pane/Tab 关闭确认、终端控制栏透明样式、无灰屏确认框、方向键圆角及 Workspace/Tab/Pane 与功能栏分隔线移除；已通过 TypeScript、相关 ESLint、133 项定向 Jest、ZIP CRC、APK v2 签名、zipalign 和 aapt2 Manifest/ABI 检查。仅本地预览签名/跳过 R8，未真机验证触摸。
- 上一版本本地测试 APK：[app-release-243.apk](android/app/build/outputs/apk/release/app-release-243.apk)，`1.7.0` / versionCode `243` / `arm64-v8a` / minSdk 24；`106,794,575` bytes；SHA-256 `d1f7ba59b25bb29d2a6f53aa60f01fb9cc711702e6505eda670580796c43b22b`。包含 Pane/Tab 关闭确认、终端控制栏透明样式、无灰屏确认框和方向键圆角；请下载 build 244 测试本轮分隔线修改。
- 上一版本本地测试 APK：[app-release-242.apk](android/app/build/outputs/apk/release/app-release-242.apk)，`1.7.0` / versionCode `242` / `arm64-v8a` / minSdk 24；`106,794,679` bytes；SHA-256 `7be37fe565e7b31029d48899055efbffe06a228d8e4e11d0c26d2ccc3bbc0c78`。包含 Pane/Tab 关闭确认及终端控制栏透明样式；请下载带 `243` 的文件测试本轮修改，不要使用旧的无版本号 `app-release.apk`。
- 上一版本本地测试 APK：[app-release-241.apk](android/app/build/outputs/apk/release/app-release-241.apk)，`1.7.0` / versionCode `241` / `arm64-v8a` / minSdk 24；`106,789,303` bytes；SHA-256 `dd51cec76199d87351fcee25db42b56a1797aad27221b63a8c21a60a0db4048a`。包含链接误触修正和省电策略。
- 上一版本地测试 APK：[app-release-240.apk](android/app/build/outputs/apk/release/app-release-240.apk)，`1.7.0` / versionCode `240` / `arm64-v8a` / minSdk 24；`106,758,927` bytes；SHA-256 `11b183aa2b93aa246d7fe86c72c0197080f49088f5a2c9d5f709abd35dcd8460`。包含 16px 阅读边距，不包含 build 241 的链接和省电修改；保留以便对照。
- 上一版测试 APK：[app-release-239.apk](android/app/build/outputs/apk/release/app-release-239.apk)，`1.7.0` / versionCode `239` / `arm64-v8a` / minSdk 24；`106,758,879` bytes；SHA-256 `65227c2848711c2ad47dde367859dd775031563ba685d8a63dc08daff2613322`。该版包含原生 IME Insets 修复，但**不包含**本轮终端阅读边距。
- 上一版测试 APK：[app-release-238.apk](android/app/build/outputs/apk/release/app-release-238.apk)，`1.7.0` / versionCode `238`；`106,760,599` bytes；SHA-256 `62687e22144b20f46b7d19e222a6416c2d24f49e7b9fff4606b4f26e5505e2c7`。该版未包含本轮 Android IME Insets 修复，用户截图显示控制栏仍被遮挡，不能用它测试本轮修复。
- 上一版测试 APK：[app-release-237.apk](android/app/build/outputs/apk/release/app-release-237.apk)，`1.7.0` / versionCode `237`；`106,768,651` bytes；SHA-256 `c95ba2e3956b7a195f1887bb7862f660d1a8f85d0a014e816d851675aac6fc98`。该版仍使用了被用户认为不美观的 Pane 文字分组标记，不能用它测试本轮改动。
- 旧诊断 APK：[app-release-236.apk](android/app/build/outputs/apk/release/app-release-236.apk)，初步真机内存反馈见 1.7 节；`app-release.apk` 仍是更旧的 build 235，不能用它测试本轮修复。
- 历史诊断 APK：[app-release-235.apk](android/app/build/outputs/apk/release/app-release-235.apk)；兼容原路径 [app-release.apk](android/app/build/outputs/apk/release/app-release.apk)，两份内容相同。`1.7.0` / versionCode `235` / `arm64-v8a` / minSdk 24；`106,762,971` bytes；SHA-256 `ce95d39949dc7dcf117714af244f3828a6a7b733355c965f881fdb5aba0ecff7`。全量 Jest 146 套件/1110 项、TypeScript、修改的 TS/TSX ESLint、终端资产检查、Gradle 8.13 assembleRelease、ZIP CRC、apksigner v2、zipalign、aapt2 通过；仅使用预览签名/跳过 R8。
- A/B 候选 APK：[app-release-234.apk](android/app/build/outputs/apk/release/app-release-234.apk)，`1.7.0` / versionCode `234` / ARM64；`106,762,187` bytes；SHA-256 `22ed779c1fbcb955f74a0aab5566a54450a4051fcbad0df1a52174f344760aa9`。仅缩小终端缓存，未减少导航 spinner 原生视图；它通过 146 套件/1109 项及 APK 校验，未真机验证。
- 旧版：[app-release-233.apk](android/app/build/outputs/apk/release/app-release-233.apk)；便于和诊断版对比，不再是兼容原路径。
- 包名：`io.github.kaminarios.whip`
- 版本：`1.7.0`，最新 versionCode `244`
- ABI：`arm64-v8a`，适合 Bigme B1051C
- 旧版 build 233 文件大小：`106,761,875` bytes
- 旧版 build 233 SHA-256：`1ab3cbfde4d7199360b74972817d25f1a2d14f14faa0235cbacf6c5d8c096e25`
- build 233：Gradle 8.13 assembleRelease 成功；最终版本化 APK 通过 ZIP CRC、apksigner v2、zipalign、aapt2（1.7.0 / 233 / arm64-v8a / minSdk 24）。签名与上一版一致。沿用仅 :app 输出到 tmpfs、previewSigning=true、skipR8=true、ARM64；未修改 Rust，跳过 buildRustArm64。临时 init script 已清理。全量 146 套件/1108 测试通过，未连接设备、未证明原生闪退已消除。
- build 232：Gradle 8.13 assembleRelease 成功；最终版本化下载文件通过 ZIP CRC、apksigner v2、zipalign、aapt2（1.7.0 / 232 / arm64-v8a / minSdk 24）。与 build 231 使用同一 Android 预览签名。构建参数沿用仅 :app 输出到 tmpfs、previewSigning=true、skipR8=true、ARM64；未改 Rust，跳过 buildRustArm64。临时 init script 已删除。未做 Bigme 真机视觉验证；Codex 跨硬换行点击仍是已知未完成项。
- build 231：Gradle 8.13 assembleRelease 成功，最终复制回仓库的 APK 通过 ZIP CRC、apksigner v2、zipalign、aapt2（1.7.0 / 231 / arm64-v8a / minSdk 24）；确认打包脚本含三行导航标识。Android 预览签名证书与 build 230 相同。沿用仅 :app 输出到 tmpfs、previewSigning=true、skipR8=true、ARM64；未改 Rust，跳过 buildRustArm64。临时 init script 已清理。跨行点击仍未完成，未做平板真机验证。
- build 230：Release 构建、最终 APK ZIP CRC、签名、zipalign 和 aapt2（versionCode=230）均通过；预览签名与 ARM64 构建参数同前。
- build 228：22 个相关测试套件累计 179 项通过；TypeScript、修改的 TS/TSX/Metro 文件 ESLint、资产一致性、git diff --check 通过。Gradle 8.13 assembleRelease 成功；最终复制到上述路径的 APK 通过 ZIP CRC、apksigner v2、aapt2 Manifest 和 zipalign 校验。缓存脚本以 ES2022/browser 环境检查无错误，原有 ANSI 控制字符正则仍有 1 个 no-control-regex 警告；不是全仓库 lint 零告警。未测真机启动时长/耗电比例。
- build 227：累计 47 项相关测试通过；新增前后台 pane 键盘请求隔离测试。Release 构建和 ZIP CRC、签名、Manifest、对齐检查通过。手势及 IME 实际效果未在 Bigme 真机验证。
- build 226：相关文件 ESLint、Release 构建及 ZIP CRC、签名、Manifest 和对齐校验通过。
- build 225：18 项相关测试、Node 语法检查、资源一致性、Release 构建和 APK 四项校验通过。新增 helper/test lint 通过；单独 lint 资产生成脚本需指定 ES2022，仍有三处已有 no-regex-spaces 警告，未宣称全量 lint 通过。
- build 224：相关测试累计 31 项通过，类型检查和相关文件 ESLint 通过；Release 构建及 ZIP CRC、签名、Manifest、对齐校验通过。未连接真机，需验证键盘弹出/收起、输入框展开/关闭以及滑动至末行。
- build 223 已通过 TypeScript、修改文件 ESLint、Gradle assembleRelease、ZIP CRC、apksigner、aapt2 和 zipalign 检查；未连接 Bigme 真机，视觉结果仍待设备验证。

本次 APK 使用本地 preview signing，即 Android Debug keystore。它适合在 B1051C 上安装测试，不是用于 Play Store 发布的正式签名包。

## 以后构建时的注意事项

### 常规构建

正式 Release 需要上传签名配置：

```text
~/.config/whip/upload-keystore.properties
```

或者设置 `WHIP_UPLOAD_KEYSTORE_PROPERTIES` 指向该文件。配置至少要有：`storeFile`、`storePassword`、`keyAlias`、`keyPassword`。不要把 keystore、密码或任何私密签名材料提交到仓库。

B1051C 的本地测试构建可以使用：

```bash
cd android
./gradlew --no-daemon --max-workers=2 :app:assembleRelease \
  -Pwhip.previewSigning=true \
  -PreactNativeArchitectures=arm64-v8a
```

`-Pwhip.previewSigning=true` 使用 Debug keystore；正式发布时删除这个参数并使用上传签名配置。`-Pwhip.skipR8=true` 只适合本地快速预览，会跳过 R8 和资源压缩，正式/CI 构建不要使用。

如果出现 `SDK location not found`，先确认 Android SDK 的实际目录，并在当前构建 shell 中设置 `ANDROID_HOME` 与 `ANDROID_SDK_ROOT`（例如 `/home/ubuntu/Android/Sdk`），或在 `android/local.properties` 中提供 `sdk.dir`；不要把机器相关的 `local.properties` 提交到仓库。

### 本次遇到的 APK 解析问题

之前生成的 APK 不能安装，原因不是包名或 Manifest，而是 APK 内部 ZIP 数据出现 CRC/压缩数据损坏。`apksigner` 单独通过并不能证明 APK 完整；必须同时运行：

```bash
APK=android/app/build/outputs/apk/release/app-release-244.apk
unzip -tq "$APK"
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose --print-certs "$APK"
$ANDROID_HOME/build-tools/35.0.0/aapt2 dump badging "$APK"
$ANDROID_HOME/build-tools/35.0.0/zipalign -c -v 4 "$APK"
```

本次构建发现当前 `/Documents` 所在 ZFS 文件系统在 Gradle/Java 生成大型 ZIP/JAR 时可能产生损坏；成功的构建只把 `:app` 的 Gradle 输出放到 `/dev/shm`（tmpfs），CMake/Prefab 依赖仍使用正常构建目录，再将已验证的 APK 复制回 `android/app/build/outputs/apk/release/`。如果以后再次出现 CRC、`aapt2` 无法读取 Manifest/资源或设备提示“there was a problem parsing the package”，优先使用 tmpfs/ext4 构建目录，不要直接分发未通过 `unzip -tq` 的 APK。

可临时创建一个 Gradle init script（不要提交）来将子项目输出放到 tmpfs：

```groovy
allprojects {
    def tmpBuildRoot = new File('/dev/shm/whip-gradle-build')
    if (path == ':app') {
        buildDir = new File(tmpBuildRoot, 'app')
    }
}
```

然后在构建命令中增加：

```text
--init-script /path/to/temporary-build.gradle
```

当前仓库的 Gradle wrapper 仍为 Gradle 9.3.1；本次成功验证使用了 Gradle 8.13 二进制配合现有 Android Gradle Plugin 8.12.0。若更换 Gradle 版本，必须重新执行上面的四项 APK 完整性检查。

build 241 实际构建参数如下（工作目录 `android`，先创建上述仅重定向 `:app` 的 `.codex-release-build.gradle`；临时 Gradle 二进制路径下次使用前需确认存在）：

```bash
EXPO_NO_DOTENV=1 \
ANDROID_HOME=/home/ubuntu/Android/Sdk \
ANDROID_SDK_ROOT=/home/ubuntu/Android/Sdk \
/tmp/whip-gradle-jCiASP/gradle-8.13/bin/gradle \
  --no-daemon --max-workers=2 --init-script .codex-release-build.gradle \
  :app:assembleRelease -Pwhip.previewSigning=true -Pwhip.skipR8=true \
  -PreactNativeArchitectures=arm64-v8a
```

本轮不能跳过 `buildRustArm64`。构建脚本复制静态库时使用 `rust/target/aarch64-linux-android/release/libwhip_ssh.a`，不要只改 `CARGO_TARGET_DIR` 而仍从旧位置复制。缺少 `clang-format` 时生成 C++ 可能带大量尾随空白，最终生成结束后仅做机械格式清理，并复查 `git diff --check`。构建产物先在 `/dev/shm/whip-gradle-build/app/outputs/apk/release/app-release.apk` 校验，再复制到带新版本号的仓库路径，比较两份哈希并再做 ZIP 校验；不要覆盖旧版测试包。构建结束只清理本次临时 init script。

build 228 的回归测试可运行：

```bash
npx tsc --noEmit
node scripts/sync-terminal-assets.mjs --check
npx jest --runInBand --silent __tests__/appStartupConcurrency.test.tsx __tests__/terminalComposerKeyboard.test.tsx __tests__/keyboardInset.test.tsx __tests__/useDecorativeProgress.test.tsx __tests__/terminalOfflineCache.test.ts __tests__/terminalDirectionPad.test.tsx __tests__/terminalEinkStream.test.ts __tests__/terminalAssets.test.ts __tests__/terminalCursorTap.test.ts __tests__/terminalTouchBehavior.test.ts __tests__/terminalRendererHost.test.tsx __tests__/terminalKeyboardAnimation.test.ts __tests__/floatingChrome.test.ts __tests__/messageComposer.test.tsx __tests__/terminalInput.test.ts __tests__/startupStorage.test.ts __tests__/terminalFocus.test.ts __tests__/terminalResize.test.ts __tests__/terminalClipboardPaste.test.ts __tests__/terminalControls.test.ts __tests__/terminalRestoreCancellation.test.tsx __tests__/terminalBackground.test.ts
```

Metro 配置变化需重新生成 Release JS bundle，不能只替换 WebView HTML。测试里的 VM 浏览器环境需注入 `TextDecoder`；使用 node:util 的实现，不要为了旧 mock 删除生产环境的流式解码。

如果 `buildRustArm64` 在 ZFS 上把 UniFFI 生成文件写坏，可先恢复
`packages/react-native-whip-ssh/cpp/generated/whip_ssh.cpp`、
`packages/react-native-whip-ssh/cpp/generated/whip_ssh.hpp` 和
`packages/react-native-whip-ssh/src/generated/whip_ssh.ts`，并确认已有有效的
`packages/react-native-whip-ssh/android/src/main/jniLibs/arm64-v8a/libwhip_ssh.a`，然后在本次只修改 JS/UI 的情况下增加：

```text
-x :react-native-whip-ssh:buildRustArm64
```

如果 Rust 源码或 UniFFI 接口发生变化，不能长期跳过该任务；必须在 tmpfs/ext4 构建目录重新生成并检查生成文件。

如果 `:app:configureCMakeRelWithDebInfo[arm64-v8a]` 报告
`react-native-reanimated/.../prefab` 不可读或目录不存在，先在同一个 init script 和参数下执行：

```bash
./gradle --no-daemon --max-workers=2 \
  --init-script /path/to/temporary-build.gradle \
  :react-native-reanimated:prefabReleasePackage
```

然后重新执行 `assembleRelease`。本次构建还验证了：首次 `clean assembleRelease` 可能需要这个显式 Prefab 步骤；临时 init script 和 `/dev/shm/whip-gradle-build` 均不应提交到仓库。

### 其他维护事项

- Gradle/Uniffi 构建可能重新生成 `packages/react-native-whip-ssh/{cpp/generated,src/generated}` 下的文件；这些是生成物，review 代码变更时不要把无关的生成差异带入提交。
- 目前默认架构仍由 `android/gradle.properties` 控制；针对 B1051C 建议明确传入 `-PreactNativeArchitectures=arm64-v8a`，避免构建不必要的 x86/32 位库。
- 改动 UI 后至少运行：

```bash
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

本次源码验证结果：TypeScript、ESLint 通过；终端资源生成测试 `4/4` 通过。此前完整 Jest 验证为 `140` 个测试套件、`1060` 个测试全部通过；本次 SSH shell 修复后未重复完整 Jest，仅运行了与终端资源相关的测试。

- 修改终端字体或脚本资源后运行 `node scripts/sync-terminal-assets.mjs`，再重新构建 Android。
