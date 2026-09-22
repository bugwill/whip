# Whip Android 输入法与输入框测试报告

## 1. 结论摘要

本轮以用户日常使用的微信输入法为主输入法，在已解锁的真实 Android 平板上进行了端到端测试；每个发现为异常的场景都至少重复确认了一次。

| 优先级 | 场景 | 结论 | 重复结果 |
| --- | --- | --- | --- |
| P1 | 展开输入框后点击顶部收起按钮 | **确认缺陷**：顶部按钮落在系统状态栏/安全区内，点击可落到 Android 桌面，无法按预期收起 | 2/2 复现；第二次明确在微信输入法场景复现 |
| P1/P2 | 切换特定 tab/pane 后终端内容变窄，右侧出现大块空白 | **高疑似显示缺陷**：`Others/Downloads` 的第二 tab/pane 中，终端 WebView 外框仍为全屏，但文字只按窄列绘制；等待后仍未恢复 | 2/2 复现；切回 `Coding/whip` 正常 |
| P1/P2 | 开启终端键盘后输入法是否立即可见 | **间歇性问题候选**：应用按钮状态、Android IME 状态和实际可见键盘偶尔不同步 | 首次需要再次点击终端才能看到键盘；重复测试状态有变化，未形成每次必现 |
| P1 候选 | 终端直输字符丢失/重复 | 首次微信输入法路径出现字符异常；重复微信输入法测试未复现，暂不能判定为稳定缺陷 | 微信首次异常，重复正常；硬件 keyevent 正常 |
| P2 候选 | 横屏微信输入法位置 | 微信输入法在横屏显示为右上浮动键盘；测试中未遮挡 Whip 控件，更像输入法自身布局策略 | 两次横屏观察到相同浮动布局 |
| 通过 | 普通原生输入框、文字编辑、发送按钮 | 文字可正常进入输入框，发送和关闭控件可用 | 通过 |

最应优先修复的是展开输入框的顶部安全区问题，以及特定 tab/pane 切换后的 terminal fit/resize 问题。前者与输入法品牌无关，但在微信输入法主场景下已经 2/2 确认，并且会将点击误导到系统桌面；后者会直接损失大部分终端可视区域。

## 2. 测试环境

- 测试日期：2026-09-22
- Whip：`1.7.0`
- Android：14，SDK 34
- 平板分辨率：`1860 x 2480`，密度 `300 dpi`
- 主输入法：微信输入法
  - package：`com.tencent.wetype`
  - service：`com.tencent.wetype/.plugin.hld.WxHldService`
- ADB 设备：`BA51B0H2FK7A007000047`
- 测试方向：竖屏、横屏
- 测试对象：已有 SSH 终端、普通终端输入、原生 Composer、展开 Composer、软键盘显示和布局

测试使用了当前项目中的已连接 SSH 终端。输入内容均为无害的 `echo` 或故意的异常字符串，没有执行修改远端文件的命令；终端滚动历史中会保留少量测试命令。

## 3. 测试矩阵

### A. 终端直接输入与键盘开关

| 编号 | 测试步骤 | 期望 | 实际结果 | 重复确认 |
| --- | --- | --- | --- | --- |
| A-01 | 冷启动 Whip，进入已有终端，不开启键盘 | 终端、底部控制栏和滚动区域不重叠 | 竖屏基线布局正常，终端底部控制栏可见 | 通过 |
| A-02 | 键盘关闭时点击“Enable keyboard”，观察按钮、焦点、输入法窗口 | 按钮选中，微信输入法立即显示，终端区域正确避让 | 首次点击后按钮已选中且隐藏输入框获得焦点，但 IME 有时未立即出现在画面；再次点击终端后微信输入法才显示。重复时 `mInputShown=true` 与视觉键盘出现时间仍有不同步 | **异常候选，已重复** |
| A-03 | 微信输入法下向终端输入英文、数字、空格和下划线，再执行 | 字符顺序、数量、空格和符号均正确 | 首次通过 `adb shell input text` 观察到 `echo%sWHIP_DIRECT_01` 变成了类似 `cheoWHIPDIRECT` 的异常结果；重复微信输入法测试得到 `echoWHIPWETYPE3`，没有再次出现同样的丢失模式 | **首次异常，重复未复现** |
| A-04 | 用终端底部 Enter 控件执行当前输入 | 当前行只执行一次 | Enter 控件可以执行；原有未执行文本与新文本连接时会形成一个整体命令，这是测试前残留输入造成的，不单独判为 Whip 缺陷 | 通过 |
| A-05 | 用 Android `KEYCODE_A/B/C` 发送 `abc` | 终端收到 `abc` 一次 | 收到一次且顺序正确 | 通过 |
| A-06 | 关闭键盘，返回终端，重新开启键盘 | 状态、焦点、IME 可重复恢复 | 状态可以恢复；可见时序仍受微信输入法动画/焦点切换影响 | 重复观察 |

说明：`adb shell input text` 不是完整的人手点击微信输入法按键的等价模拟，它绕过了部分真实 IME 合成过程。因此 A-03 的首次异常应作为高价值线索，不应在未用实体键盘逐字输入、中文拼音合成、候选词确认、退格等操作前直接定性。

### B. 普通原生 Composer

| 编号 | 测试步骤 | 期望 | 实际结果 | 重复确认 |
| --- | --- | --- | --- | --- |
| B-01 | 在终端点击“Compose terminal input” | Composer 位于键盘上方，发送/关闭按钮可见且可点 | 竖屏下输入框和发送、关闭按钮均在微信输入法上方；未观察到遮挡 | 通过 |
| B-02 | 在 Composer 输入 `abcXYZ123` | 原生输入框显示精确文本，不重复、不丢字 | 文本精确显示 `abcXYZ123` | 通过 |
| B-03 | 点击发送，再关闭 Composer | 文本发往终端，控件关闭 | 发送和关闭均可用；多行输入的 Android Enter 行为是换行/收起软键盘，发送需要使用 Whip 的发送按钮，符合当前设计 | 通过 |
| B-04 | 在竖屏、微信输入法打开时点击展开 | 进入全屏输入，顶部和底部控件都处于可点击安全区 | 展开后输入框主体可见，但顶部收起和发送控件的 UI bounds 从 `y=12` 开始，处于系统顶部区域；见 C-01 | 2/2 异常 |

### C. 展开 Composer 的安全区/错位场景

#### C-01：已确认缺陷

复现步骤：

1. 在终端打开普通 Composer。
2. 点击“Expand input composer”。
3. 点击屏幕顶部约 `y=60` 的收起按钮中心。

实际结果：

- 收起按钮 bounds：约为 `[18,12][117,111]`。
- Android 系统顶部区域从 `y=0` 到约 `y=84`；按钮的有效点击区域部分落在此区域。
- 第一次点击顶部按钮中心没有触发 Whip 的收起，而是触发/进入 Android Launcher。
- 通过按钮下半部约 `y=100` 点击才可收起。
- 第二次重复测试仍然从 Whip 的展开 Composer 顶部按钮误触到 Launcher。

判定：**P1，2/2 确认**。第二次是在微信输入法恢复为默认输入法后重复确认。该问题即使不显示软键盘也存在，根因主要是展开 Modal 的顶部安全区，而非微信输入法本身。

建议修复：

1. Android 下优先去掉展开 Composer 的 `statusBarTranslucent`，让 Modal 内容从状态栏下方开始。
2. 如果必须使用 translucent，显式确保顶部 header 的实际起点至少为 Android 状态栏高度，不能只依赖当前 `topSafeAreaInset`。
3. 计算顶部内边距时合并 Android `StatusBar.currentHeight` 或 WindowInsets top，并避免重复加 inset。
4. 加自动化断言：展开后收起按钮的 top 必须大于等于状态栏底部；点击按钮中心必须仍保持 Whip Activity 前台。

代码关联：

- `src/components/TerminalScreen.tsx:2470` 附近的展开 Composer 使用了 `statusBarTranslucent`。
- 同一段 header 在 `src/components/TerminalScreen.tsx:2485` 附近开始渲染顶部按钮。
- Native 原生键盘适配见 `src/hooks/useKeyboardInset.ts:13` 和 `android/app/src/main/java/io/github/kaminarios/whip/HerdrSoftInputModule.kt:54`。

### D. 横屏与微信输入法布局

| 编号 | 测试步骤 | 期望 | 实际结果 | 重复确认 |
| --- | --- | --- | --- | --- |
| D-01 | 关闭自动旋转，切换横屏，不开启键盘 | 终端和底部控制栏按横屏尺寸重新布局 | 终端 bounds 约为 `[0,84][2480,1461]`，底部控制栏仍在屏幕底部上方，未见重叠 | 通过 |
| D-02 | 横屏下开启微信输入法 | IME 的可见区域被正确识别，不能遮住控制区 | 微信输入法以右上方浮动面板显示，终端控制栏仍在底部，未见 Whip 控件被遮挡；浮动面板覆盖部分终端输出区域 | 两次观察到相同布局 |
| D-03 | 横屏下打开普通 Composer | Composer 仍位于可用区域内，发送/关闭可见 | Composer 在底部，微信输入法浮动面板在右上；输入框、发送、关闭按钮未重叠 | 通过 |

判定：D-02 暂列 P2 候选，而不是已确认 Whip 缺陷。微信输入法在平板横屏下主动选择浮动布局，Whip 当前已经使用 IME 可见区域进行避让；如果产品要求键盘必须贴底，应增加产品设置或兼容策略，但不能仅凭“不是底部”判定应用计算错误。

### E. 性能与时序观察

用户反馈“卡”和弹出错位，本轮观察到的风险点如下：

- 微信输入法出现/隐藏有动画，`keyboardDidShow`、`keyboardDidChangeFrame`、WindowInsets 和 React Native layout 回调并不一定同一帧到达。
- Whip 的终端直接输入是 WebView/xterm textarea，再经过 Android IME bridge 转成终端增量；同一次输入可能同时触发 composition、beforeinput、input 和 xterm 自身处理。
- Composer 使用原生 `TextInput`，实际输入稳定性明显好于终端直输路径。
- 横屏微信输入法浮动面板会改变 IME frame 形态，不能只按“屏幕底部键盘高度”推算遮挡。

本轮没有建立帧耗时和“按键到终端回显”的自动采样基线，因此不能把卡顿量化为固定 FPS 或延迟，也没有把未重复确认的卡顿列为已确认缺陷。

## 4. 可能原因与对应方案

### 4.1 展开 Composer 顶部按钮落入系统区域

可能原因：

- Modal 使用 `statusBarTranslucent`，但顶部 header 的布局/点击坐标仍从接近 `y=0` 开始。
- `topSafeAreaInset` 在当前 Android Modal window 中没有反映真实状态栏高度，或者 RN Modal 坐标系与主 Activity 坐标系不一致。
- UI 自动化显示的 bounds 与视觉可点击区域一致地落入系统区域，说明不是单纯图标绘制偏移，而是实际 hit target 位置有问题。

方案：

- Android 展开 Composer 改为非 translucent Modal；或用 WindowInsets 给整个 header 增加真实 top inset。
- 把顶部按钮放在状态栏下方，而不是仅给外层 View 设置 padding 后依赖 Modal 自动处理。
- 在平板竖屏、横屏、不同状态栏显示模式下增加端到端测试。

### 4.2 开启键盘后视觉键盘与状态不同步

可能原因：

- 键盘按钮状态来自 React state/终端 renderer，IME 可见状态来自 Android Window/WeChat service，三者更新时序不同。
- `setTerminalComposerOverlay` 会在 `adjustResize` 与 `adjustNothing` 之间切换，切换期间 RN 的键盘 frame 事件可能仍是旧窗口尺寸。
- 代码同时使用 RN `Keyboard` 事件、`Keyboard.metrics()`、View `measureInWindow` 和 native `getImeTopInWindow`，在 IME 动画期间可能先得到零 overlap，再得到最终 overlap。
- 隐藏输入框获得焦点不等于微信输入法已经完成可见动画。

方案：

- 建立单一 IME 状态机：`requested -> focusing -> visible -> settled -> hidden`，不要仅以按钮 state 表示已可输入。
- 收到焦点后等待 `keyboardDidShow` 或 native WindowInsets visible，再执行一次延迟 remeasure；超时则重新 focus 一次并记录诊断信息。
- 以 native WindowInsets 的最终 IME top/visible bounds 为权威值，RN keyboard frame 仅作早期动画提示。
- 对 `adjustResize`/`adjustNothing` 切换前后固定延迟或使用下一帧/下一次 layout 重新测量，并记录 viewport、IME top、keyboard height 和最终 inset。
- 增加微信输入法的开启、关闭、切换 pane、旋转、返回前台测试。

### 4.3 终端直输字符丢失、重复或合并

可能原因：

- Android 微信输入法编辑 WebView 的 composing textarea；代码在 `scripts/android-ime-bridge.cjs:1` 附近根据 textarea 前后值生成 terminal delta。
- composition、beforeinput、input 的顺序和是否携带最终值因 Android WebView/IME 而异；`setTimeout(..., 0)` 的 reconcile 可能与 xterm 原生处理同时发生。
- 如果 xterm 自己处理了一次，bridge 又根据 mirrored value 发出一次，可能重复；若 mirrored value 在 composition 结束前被清空，也可能丢失字符。
- `adb shell input text` 对空格、下划线、特殊字符和 IME 合成并不完全等同于微信输入法的人手操作，因此需要实体输入验证。

方案：

- 为每个输入事件记录 sequence、event type、`isComposing`、`inputType`、value、selectionStart/End 和实际发送的 delta，定位是否重复发送或错误清空。
- Android 下保证每次 textarea mutation 只由 bridge 处理一次，明确阻止 xterm 默认处理的边界；compositionend 以 textarea 最终值为准。
- 对中文拼音合成、候选词确认、英文连续输入、数字、空格、下划线、退格、选中替换、粘贴、回车分别做真机测试。
- 对需要稳定批量输入的场景优先复用原生 Composer，再一次性发送；不要把 `adb input text` 的行为作为唯一验收标准。
- 现有 `__tests__/androidImeBridge.test.ts` 已覆盖部分 delta 和 composition 规则，但还应补微信输入法真机 E2E。

### 4.4 横屏浮动输入法

可能原因：

- 微信输入法在平板横屏状态下默认使用浮动/紧凑布局，面板不一定贴底。
- 应用如果把 IME 只建模成底部矩形，会错误地认为上方浮动面板不存在。

方案：

- 应用侧继续使用 WindowInsets/IME visible bounds，不要硬编码“键盘一定从底部出现”。
- 如果产品必须固定键盘形态，应在测试说明或应用设置中要求关闭微信输入法的浮动键盘；不建议由 Whip 强行覆盖第三方输入法布局。
- 对浮动 IME 覆盖终端输出时，确认重要控件仍不在浮动面板区域，并考虑在输入期间自动滚动到可见行。

## 5. 建议的修复优先级

1. **立即修复 C-01**：移除或正确处理展开 Composer 的 `statusBarTranslucent`，保证顶部按钮不进入系统状态栏；加入 2 个方向的自动化点击验收。
2. **补齐 IME 诊断日志**：记录键盘按钮状态、焦点、RN Keyboard 事件、WindowInsets、viewport bounds 和 IME package，先解决 A-02 的时序不确定性。
3. **用真实微信输入法做 E2E**：不要只使用系统 Latin 输入法或 `adb input text`；覆盖中文合成、英文、数字、符号、退格、回车、候选词和旋转。
4. **排查 bridge 重复发送**：针对 A-03 的首次异常加入事件序列日志和测试用例；在重复真机测试前不要直接重写 bridge。
5. **再做性能优化**：记录输入到终端回显延迟、IME 动画期间布局次数和 WebView/xterm 脚本耗时，确认瓶颈后再调整 debounce/batch。

## 6. 建议验收标准

- 微信输入法默认状态下，点击开启键盘后 500 ms 内出现可见键盘，或界面明确显示“正在打开”而不是假定已打开。
- 键盘显示、隐藏、旋转、切换终端 pane 后，终端控制栏和 Composer 均不被 IME 遮挡。
- 展开 Composer 的所有顶部按钮中心点都位于状态栏下方，点击收起不会退出 Whip 或进入 Launcher。
- 微信输入法输入 100 次英文/数字、20 次中文候选词确认、退格/替换/粘贴测试，终端收到的字节序列与用户输入一致，不重复、不丢失。
- 横屏浮动 IME 出现时，应用不把浮动键盘误判成底部键盘；发送、关闭、收起和终端控制按钮仍可操作。
- 真机测试后运行项目已有的 bridge、Composer、keyboard animation 和 terminal resize 单元测试。

## 7. 代码与证据索引

- `src/components/TerminalScreen.tsx:2470`：展开 Composer Modal 与 `statusBarTranslucent`。
- `src/hooks/useKeyboardInset.ts:13`：RN Keyboard 事件、metrics、measureInWindow 和 native IME top 合并逻辑。
- `android/app/src/main/java/io/github/kaminarios/whip/HerdrSoftInputModule.kt:54`：通过 WindowInsets 获取 IME top；约 120 行切换 `adjustNothing`/`adjustResize`。
- `scripts/android-ime-bridge.cjs:1`：Android WebView textarea 的 composition/input bridge。
- `__tests__/androidImeBridge.test.ts`：现有 bridge delta/composition 单元测试。
- 本机临时截图证据：`/tmp/whip-composer-expanded.png`、`/tmp/whip-composer-collapsed-after-expand.png`、`/tmp/whip-wetype-composer-repeat.png`、`/tmp/whip-landscape-wetype-keyboard.png`、`/tmp/whip-landscape-composer.png`。

## 8. 测试限制

- 本轮没有修改业务代码，只生成本报告。
- 运行 Jest 时本机缺少项目所需的 `@react-native/jest-preset`，`npx` 临时安装的 Jest 30 无法加载该 preset，因此本轮不能把单元测试结果伪装成通过；真机观察结果仍有效。
- ADB 测试输入不能完全替代手指在微信输入法上的真实输入，A-03 必须在修复前后用人工输入和中文合成再次验收。

## 9. 工作状态与系统流畅度专项测试

### 9.1 测试方法

本次追加测试仍使用微信输入法、竖屏、`1860 x 2480` 平板。每组操作前通过 `adb shell dumpsys gfxinfo io.github.kaminarios.whip reset` 清空 Android UI 渲染统计，再按约 `0.8–1.0 s` 的间隔连续点击，最后读取 `dumpsys gfxinfo`。统计值是操作批次的样本，不等同于实验室固定 60 FPS 基准；截图和终端远端内容重绘也会计入渲染压力，但可以用于比较不同工作状态的卡顿风险。

### 9.2 操作结果与渲染统计

| 编号 | 操作批次 | 结果 | UI 渲染样本 |
| --- | --- | --- | --- |
| F-01 | Workspace：`Financials -> Others -> Coding -> Rsearch -> Auto-Run` | 切换均完成，无崩溃；内容切换期间有明显重绘 | 54 帧，Janky `44.44%`；P50/P90/P95/P99：`23/81/109/129 ms`；高输入延迟 14，慢 UI 线程 10 |
| F-02 | Tab：`Others/Downloads` 两个 tab 来回切换 4 轮 | 切换可以完成；第二 tab 的内容恢复较慢，存在窄列/空白问题 | 82 帧，Janky `40.24%`；P50/P90/P95/P99：`23/46/57/73 ms`；高输入延迟 38，慢 UI 线程 12 |
| F-03 | Pane：`Coding` 中 `codex` 与 `whip` 来回切换 3 轮 | 切换完成，两个 pane 在该 workspace 中均保持正常宽度 | 61 帧，Janky `37.70%`；P50/P90/P95/P99：`23/34/42/53 ms`；高输入延迟 23，慢 UI 线程 8 |
| F-04 | 键盘按钮：关闭/开启连续切换 2 轮 | 状态可切换，但微信输入法可见性与按钮状态有不同步；一次批次 P90/P95 达到 93/113 ms | 50 帧，Janky `38.00%`；P50/P90/P95/P99：`24/93/113/125 ms`；错过 Vsync 5，高输入延迟 13 |
| F-05 | 关闭键盘后点击 terminal 内容，让键盘展开 | 在 `Others/Downloads` 的一次场景中微信输入法展开成功，终端和 dock 上移；该批次有明显重排 | 18 帧，Janky `44.44%`；P50/P90/P95/P99：`15/61/69/69 ms` |
| F-06 | 键盘逻辑开启后切换 `Others -> Coding` | 切换后 IME 被隐藏，回到 `Enable keyboard` 状态；没有崩溃，但状态被重置 | 18 帧，Janky `55.56%`；P50/P90/P95/P99：`27/57/61/61 ms`；高输入延迟 8，慢 UI 线程 6 |

补充的空闲资源快照：Whip 进程约 `286 MB PSS`，空闲采样 CPU 约 `3.7%`。本轮没有看到 ANR、崩溃或 ADB 断开。由于设备是 E-Ink/低刷新特征平板，Janky 比例不能单独证明所有卡顿都来自 Whip，但 F-02、F-04、F-06 的输入延迟和长帧值已经足以作为优化优先级依据。

### 9.3 新发现：特定 tab/pane 切换后终端内容压窄

复现步骤：

1. 进入 `Others` workspace。
2. 选择 `Downloads 2` tab。
3. 在两个 `Downloads` pane 之间切换。
4. 等待 2 秒，再截图和读取 UI bounds。

实际现象：

- Whip 的 `terminal`、`terminal-geometry` 仍报告完整外框 `[0,84][1860,2081]`。
- 但终端内的 Codex/ shell 文本按大约 1/4 屏宽的窄列换行，右侧保留大面积纯空白。
- 切换到另一个 pane 后仍然出现；第二次重复切换并等待后仍出现。
- 切换回 `Coding/whip`，同样大小的 terminal 外框和文本宽度恢复正常。
- 键盘开启后该窄列仍然存在，说明不是单纯底部键盘 dock 遮挡。

判定：**P1/P2 高疑似显示缺陷，2/2 复现，但目前限定在 `Others/Downloads` 这组已有会话**。它不是普通的“终端内容比较少导致空白”：文本本身已经被窄列换行，且右侧空白随 pane/tab 状态出现。

可能原因：

- 切换 active target 后，WebView 外层已经恢复全宽，但 xterm FitAddon/PTY resize 仍保留了上一个较窄尺寸。
- 单 WebView 多 terminal session 的 `herdrActivate -> herdrFit -> resize` 异步链路可能出现旧 target 的 resize 覆盖新 target，或 resize arbitration 把新尺寸去重掉。
- 远端 Codex/TUI 已收到旧的窄 `cols`，即使外层 View 恢复全宽，远端输出仍按窄终端宽度换行。
- 键盘、workspace、tab、pane 连续切换时同时发生 `adjustResize` 和 xterm fit，可能放大时序竞争。

建议解决方案：

1. 每次 workspace/tab/pane 激活后，在 React Native `onLayout` 稳定并且 WebView `clientWidth/clientHeight` 大于 0 后强制执行一次 fit；不要只依赖 active key 改变时的旧尺寸。
2. 记录并校验 `clientWidth/clientHeight`、xterm `cols/rows`、发送给后端的 PTY `columns/rows`。对于全屏平板却得到异常小的 `cols`，延迟一帧重试，而不是接受该尺寸。
3. 给每次 resize 增加 target key 和 generation，旧 target 的 resize 回调不能覆盖新 active target；`fit-complete` 必须对应当前 generation。
4. 在键盘开关、IME frame 变化和 workspace/tab/pane 切换组合发生时，顺序固定为：布局稳定 -> fit -> 后端 resize -> 收到首帧 -> 恢复显示。
5. 加真机回归用例：`Others/Downloads` 2 tab、2 pane，重复切换 10 次，要求文本宽度与 full WebView 宽度一致、无右侧异常空白。

代码关联：

- `src/components/TerminalRendererHost.tsx:1260–1276` 附近负责 active target 激活和 `herdrFit`。
- `src/components/TerminalRendererHost.tsx:1487–1504` 附近处理 `fit-complete` 和 pending resize。
- `src/components/TerminalRendererHost.tsx:1573–1625` 附近接收 xterm resize 并向后端发送 terminal resize。
- `scripts/sync-terminal-assets.mjs:1859` 附近的多 terminal WebView 使用单个 `#terminals` 容器，并通过 `.terminal-session.presented` 切换可见 session。

### 9.4 键盘按钮与点击 terminal 的流畅度结论

- 点击“开启键盘”后，Android `mInputShown=true`、`mVisibleBound=true`，但画面中微信键盘不一定可见；有时只看到终端区域缩短约 70 dp，底部控件上移，等待 3 秒也没有恢复可见键盘。这一状态已在多个工作状态下重复观察。
- 关闭/开启按钮连续操作时没有崩溃，但长帧明显增加，F-04 的 P90/P95 达到 `93/113 ms`，会产生“卡一下”的体感。
- 直接点击 terminal 内容有两种结果：在 `Others/Downloads` 场景曾成功弹出完整微信键盘；在 `Coding/whip` 当前重复场景中只触发布局缩短而没有看到键盘，说明焦点、WebView textarea 和微信输入法窗口之间存在时序不确定性。
- Workspace 切换会把已开启的键盘状态重置为隐藏；这可以是产品设计，也可能造成用户感觉输入法被无故收起，需要明确产品预期并加入验收。

建议优先加入输入法状态日志：点击来源、active target、keyboardEnabled、focused、`Keyboard.metrics()`、WindowInsets IME visible/top、terminal viewport bounds 和微信输入法 package，才能把“卡顿”和“IME 没有真正出现”拆成可定位的阶段。
