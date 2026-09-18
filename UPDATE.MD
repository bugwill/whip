# UPDATE

日期：2026-09-18

本次修改目标：让 Whip 更适合 Bigme B1051C（10.3 英寸 E-Ink 平板），并生成可安装的 ARM64 Android Release APK。

## 已完成的修改

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

- APK：[android/app/build/outputs/apk/release/app-release.apk](android/app/build/outputs/apk/release/app-release.apk)
- 包名：`io.github.kaminarios.whip`
- 版本：`1.7.0`，versionCode `229`
- ABI：`arm64-v8a`，适合 Bigme B1051C
- 文件大小：`106,746,171` bytes
- SHA-256：`92a3e5d451071bede6d22583b1004a516adea400795cea0350ff35aebe2a6466`
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
APK=android/app/build/outputs/apk/release/app-release.apk
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
