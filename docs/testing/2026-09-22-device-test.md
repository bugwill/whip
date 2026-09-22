# Android 实体机测试与修复记录（2026-09-22）

## 状态与版本边界

测试执行：Luna xhigh，经 ADB 操作实体机；代码分析、证据审核：主线程。

- 设备：`BA51B0H2FK7A007000047`，Android 14 / API 34，1860×2480。
- 包名：`io.github.kaminarios.whip`，安装版本 1.7.0 / code 245。
- 旧版基线安装更新时间：2026-09-22 16:29:09。
- 旧版基线安装 APK 与当时本地 APK SHA-256 一致：`bfe2790f8340232531a2e9503a54a96ec42eba4cbd2e41eb48c68cbcd615049d`。当前已安装本轮修复版，SHA-256 `85ad65aeba821c33520b9c526d4d416511ab2cc51a64d83981aafecacf737b15`。
- 当前源码基线：`88238da8574fba1128e54ffa0d8c6bea61f081c8`。安装时间早于提交，尚无构建来源证明，不能仅凭版本号/现有 APK 一致宣称覆盖了当前提交全部修改。
- 本轮原始证据：`/tmp/whip-device-test-20260922/`。截图与 UI dump 由 Luna 采集，主线程已直接查看两次 More 输入框遮挡截图、第二次焦点 bounds、IME region、内存和帧统计。
- 已完成：旧版实体机测试与 More 遮挡两次复现、源码修复、主线程审核、110 项相关自动化测试、ARM64 release 编译及完整性校验、安装。
- 新版独立回归已完成：More 遮挡修复在 Fcitx 与微信输入法下各通过两次；性能、表单及 pane 恢复集中验收见 [最终验收报告](2026-09-22-final-acceptance.md)。全屏键盘视觉检查保留限制；此报告不是全范围无缺陷声明。

以下前三节按测试发生顺序记录旧 APK 基线；新版结果见后面的“新版”各节，历史待测描述不代表最终状态。

## 1）性能、内存测试清单与结果

计划：启动耗时；空闲/操作时 PSS、堆、CPU；Tab/pane/键盘循环的帧耗时和内存趋势；前后台恢复；崩溃/ANR；长时间输出与多 pane 压力。冷启动不得触发被禁止的密钥读取或认证。

已测：

| 项目 | 结果 | 原始证据 |
| --- | --- | --- |
| Hosts 初始 PSS | 297554 KiB（约 291 MiB） | `meminfo-hosts.txt` |
| 5 轮导航后 PSS | 307736 KiB（约 301 MiB） | `meminfo-after-nav.txt` |
| 3 轮后台 PSS | 300651 / 308956 / 309155 KiB | `meminfo-bg-{1,2,3}.txt` |
| 3 轮前台 PSS | 344739 / 326407 / 327123 KiB | `meminfo-fg-{1,2,3}.txt` |
| 5 轮 Tab 导航渲染 | 32 帧；Janky 12（37.5%）；P50/P90/P95/P99 = 24/48/69/77 ms | `gfxinfo-nav-5cycles.txt` |

结论：短轮次恢复后的 PSS 未持续增长，但不能排除泄漏。32 帧样本可提示交互长帧，不能外推稳定 FPS，也不足以单独认定性能 bug。长时间、多 pane 输出、冷启动、完整 CPU/堆趋势尚未覆盖。

## 2）界面、Tab 与输入法测试清单与结果

计划：各 Tab 空态/列表/详情/弹窗；首次与重复唤起 IME；原生输入与终端直输；输入框可见性、安全区、底部栏、内容高度；收起/返回；草稿与焦点；键盘开启时跨 Tab/pane；横竖屏、拼音合成和候选确认。

已覆盖 Hosts、Herd、More 页面导航、More 反馈表单，以及新主机本地表单输入法观察；终端直接输入和 Composer 等依赖连接场景未完成。未提交反馈、未创建远端会话。

新主机表单：Display name、SSH user 在 IME 打开后完整可见；SSH password 自动上移，下缘贴近 IME，但光标和输入区可见，未确认为缺陷。此组只做覆盖检查，未输入内容、未保存，未访问 Private key；没有将边缘布局观察算作两次复现的 bug。

### 确认缺陷：More 反馈输入框被 IME 遮挡（独立复现 2/2）

期望：点击 `Short title` 后，输入框保持可见并可编辑。

首次：展开 More 反馈表单，点击 `Short title`；键盘出现，截图中表单输入区被覆盖。

第二次独立起点与步骤（Luna 执行记录）：

1. `KEYCODE_BACK` 收起 IME，确认 `mInputShown=false`。
2. 收起反馈卡片，UI dump 中已无 EditText。
3. 重新展开表单，再点击 `Short title`。
4. `mInputShown=true`；focused 输入框 bounds 为 `[271,1888][1786,1988]`；IME touchable region 为 `(0,1582,1860,2480)`，覆盖输入框。

证据：`ime-title.png`、`ime-title-ui.xml`；`ime-repro2-collapsed.png`；`ime-title-repro2.png`、`ime-title-repro2-ui.xml`、`window-title-repro2.txt`、`input-method-title-repro2.txt`。

测量限制：`ime-title-tap-start/end.txt` 相差 55 ms，只是 ADB 点击命令执行耗时，**不是 IME 从点击到可见的延迟**。本轮尚无可靠首帧时序测量。

## 3）后台 pane 停更与切回测试清单、限制

计划：隐藏 pane 停止 WebView 更新；短时/长时离开后的完整画面补齐；没有新输出时主动刷新；快速往返、多 pane 与淘汰后恢复；内容不丢失、不重复、不乱序；滚动位置、草稿、焦点；应用前后台恢复与重连边界。

首次测试时，既有终端显示 `Reconnecting terminal / Opening 继续处理 | whip`，因此当时未完成终端场景。

后续用户明确授权并澄清：通过 ADB 重启 Android 上的 Whip，不需要助手执行 SSH。此前将应用正常重启与助手访问 SSH 密钥混同的阻塞判断已纠正。Luna 已执行 ADB 重启，终端恢复；仍禁止助手读取/操作密钥文件或自行 SSH 登录。主线程已查看 `restart-am-start.txt` 与 `pane-long-return-10s.png`，后者显示当前正在运行的 Codex 任务最新输出。短/长离开及快速 pane 切换测试进行中，完整结果待补充。

源码核对：非 SSH 隐藏 pane 丢弃渲染帧；激活后经 fit 请求完整 baseline。对应模拟测试已通过，但不能替代实体机验收。

重启后的旧 APK 实测（Luna）：

- 单次 force-stop/start；约 1 秒仍加载，约 5/10 秒 Hosts UI 稳定。这里的截图检查点不是精确首帧延迟，且 Hosts 当时延迟显示 `— ms`，不能据此断言已实时连接。
- 短后台 1 次；返回约 3 秒显示 Codex pane，约 9 秒内容继续更新。
- 后台约 15 秒 1 次；返回约 3 秒显示 Codex 内容，约 10 秒仍显示更新。15 秒不视为长时压力测试。
- `adb → codex → adb → codex` 切换；Codex 内容可见，两个 adb shell 截图 viewport 空白。由于尚无该 pane 原本应有内容的证据，**不认定为 bug**。
- 受控输出已成功：专用测试 shell 通过原生 Composer 发出两组有限输出，每秒一行，从 `whipr1a` 到 `whipr1l`、从 `whipr2a` 到 `whipr2l`。主线程直接检查 `round2-return-0p7.png` 与 `round2-return-8p7.png`，两组最终标记均齐全、按序，未看到重复。回到前台后能显示隐藏期间产生的内容；准确操作时间待 Luna 汇总。无法仅由截图证明隐藏期间完全停止 WebView 渲染。
- 60 秒后台恢复已执行，`bg60-home.txt` 与 `bg60-after-wait.txt` 相差 60.640 秒；PSS 前台 326567 KiB、后台 305974 KiB、返回 339435 KiB。单次恢复变化不足以判定泄漏。
- ADB 批量输入在测试中出现错字；先改用原生 Composer 并核验 UI dump 的精确文本，再执行命令。首个 echo 曾附带测试前残留的“继续”，第二次正确回显；这些测试准备/注入问题未直接认定为产品 bug。

## 代码分析与修复方案

当前源码将 Manifest 默认窗口模式改成 `adjustNothing`，且 `HerdrSoftInputModule.applySoftInputMode` 无条件选择 `SOFT_INPUT_ADJUST_NOTHING`，已有 `overlayOwners` 不再决定模式。`MoreScreen` 使用普通 ScrollView，没有自己的 IME 避让。这是与实体遮挡现象一致的代码风险；因安装包来源边界，不能据此断言所有已测行为均由该提交引入。

主线程交给 Luna 的方案：

1. 普通 Activity 默认恢复 `adjustResize`。
2. native 按 overlay owner 是否存在选择 `adjustNothing` / `adjustResize`。
3. 可见 TerminalScreen 单独持有 screen owner，与 Composer owner 分离；保持终端直输/Composer 手动 inset；隐藏、卸载或身份变化时释放。
4. 增加可见/隐藏/卸载及关闭 Composer 后 screen owner 保留的行为回归测试。未经真机证据，不改后台 pane 算法。

Luna 已按方案完成三个产品文件和 owner 行为测试，主线程已审核通过。主线程独立复跑下述同一组测试得到 5 suites / 110 tests 全部通过，两个改动 TSX 文件的 ESLint 与 `git diff --check` 通过。修复后实体机结果见下方独立回归记录。

已按用户要求由 Luna 编译完成，详细记录见 [构建报告](2026-09-22-build.md)。ARM64-only release、R8 启用，SHA-256 `85ad65aeba821c33520b9c526d4d416511ab2cc51a64d83981aafecacf737b15`。主线程独立验证新 APK 的 CRC、aapt2、apksigner、zipalign 全部通过。旧版备份曾出现损坏，已从设备只读恢复，主线程复验其 SHA-256 与原版一致且 CRC 通过。临时 tmpfs 构建目录已清理。已交给 Luna 安装修复版并执行回归。

主线程还直接检查了新 APK 内容：Manifest 的 `windowSoftInputMode=0x10`（adjustResize）；打包的 Hermes bundle 含新增 `terminal-screen-overlay-sync/reset` 标记，确认产物包含本轮修改，而非仅凭相同版本号判断。

新版已 `adb install -r` 成功安装。Luna 回读安装 APK 后计算 SHA-256；主线程核对 `new-build/installed-base-sha256-r.txt` 和 `local-apk-sha256-r.txt`，两者均为 `85ad65…737b15`。新版界面回归证据位于原证据目录的 `new-build/` 子目录，结果待追加。

用户随后说明安装新版后曾手动操作设备。该时间段的新版 UI 回归作废，不据此认定通过或失败；安装与 APK 哈希核验仍有效。此前 Luna 也观察到坐标变化引起的误点和设备从 ADB 断开，尚未取得有效的两次回归证据。已按用户要求重新交给 Luna xhigh，从确认设备在线和明确初始状态开始；新一轮证据单独保存至 `retest-after-user/`。

重测启动检查：Luna 的 `adb devices -l` 仅有标题、没有设备，无法开始新一轮操作。等待设备重新接入并在 ADB 中显示为 `device`；新版实机验收仍未完成，不宣称修复已在真机通过。

后续连接已恢复：主线程重新执行 `adb devices -l` 确认 `BA51B0H2FK7A007000047 device`，再次将新版独立回归交给 Luna xhigh。工作区与新 APK SHA-256 未变。

### 新版独立回归：Fcitx 输入法

本轮当前输入法为 `org.fcitx.fcitx5.android/.input.FcitxInputMethodService`，与旧版最初的微信输入法不同，分别记录。

主线程直接检查 `retest-after-user/repro1-short-title.png`、`r1-focused-ui.xml`、`r2-focused-ui.xml` 和两轮 WindowInsets / input-method dump：两轮 `Short title` 均 focused，bounds `[271,1530][1786,1630]`；当前可见 IME frame `[0,1630][1860,2480]`，`mInputShown=true`。输入框完整位于键盘上方，旧版整框遮挡现象在这两轮未复现。第二轮有关闭 IME、收起与展开表单的独立起点证据。

注意 Window dump 同时含旧/隐藏窗口的 InsetsSource 和 touchable region；判断以当前可见 IME frame 和截图为准，不能把旧 `y=1582` 区域误当当前视觉边界。

### 新版独立回归：微信输入法

恢复原复现环境中的微信输入法后，又完成两次独立回归。主线程查看 `wechat-repro2.png`、`wechat-r{1,2}-focused-ui.xml` 和 `wechat-r2-window.txt`：两次 focused 输入框 bounds 均为 `[271,1482][1786,1582]`，IME 可见 frame `[0,1582][1860,2480]`。两次输入框都完整位于键盘上方。加上 Fcitx 两次，共 4 次有效回归未再复现原 More 整框遮挡；其余新版场景仍在进行。

### 新版 Composer 输入法响应采样

`composer-ime-poll2.txt`：tap start `1790072894696`；两次采样 false；第三次采样标记时间 `1790072895026` 返回 `mInputShown=true`；完成确认时间 `1790072895119`。第三次采样起点距点击 330 ms，但 dumpsys 本身有开销，保守的**系统 IME 可见标志确认上界为 423 ms**，不是精确的首个可见像素延迟。主线程直接核对日志并修正了最初的 330 ms 上界表述。

`composer-confirm2-ui.xml` 的原生 Composer focused，bounds `[137,1343][1725,1514]`。当前输入法恢复为用户的 Fcitx。最后集中验收由独立的 Luna xhigh 接手，前一测试代理已停止所有 ADB 操作，无运行中的交互 session。

### 新版集中性能采样

证据目录 `final-acceptance/`。主线程核对 `perf-baseline-summary.txt` 与 `perf-after-switch-summary.txt`：PSS 从 315284 到 322400 KiB，增加 7116 KiB（约 6.9 MiB）；Native Heap PSS 89499→90155 KiB，Dalvik Heap PSS 13315→13363 KiB，Graphics 19056→24148 KiB。

两份 gfx summary 的 Stats since 相同，帧数 870→920、janky 187→198，因此该段差分为 50 帧、11 长帧（22%）。结束时的 920 帧、21.52%、P95=48ms 是进程累计统计，不能宣称为这段切换操作的批次百分位。单段增长不足以判定内存泄漏。

60 秒后台恢复后 PSS 为 335987 KiB（约 328 MiB），Native Heap PSS 86875 KiB、Dalvik Heap PSS 13611 KiB、Graphics 37144 KiB；CPU 单次快照为 8.3%。恢复时图形内存增加而 native heap 下降，有限采样不能证明泄漏或长期稳定性。

## 自动化基线

主线程运行 `npx jest --runInBand`，指定 `terminalRendererHost.test.tsx`、`keyboardInset.test.tsx`、`terminalComposerKeyboard.test.tsx`、`terminalTouchBehavior.test.ts`、`terminalAssets.test.ts`：5 suites / 108 tests 通过。Composer 测试 mock 存在 JSX key spread 警告，未作为实体机缺陷。

修复后同组复跑为 5 suites / 110 tests 全通过（新增两个 owner 生命周期行为测试），并通过 ESLint 与 diff 空白检查。

### 新版最后证据审查与范围限制

主线程直接查看 `final-acceptance/sequence2-returned-output-now.png`：`qb_a` 至 `qb_l` 完整、按序、未见重复。命令在 18:47:21 发送，每秒输出一行；18:47:26 切到其他 pane，因此隐藏期间确实有后续输出。日志第一次返回坐标为空，不能将 18:47:34 当作有效恢复时间；后续返回和截图证明最终内容恢复，不据此给出精确恢复延迟。

全屏编辑器稳定打开、输入焦点及 IME 可见系统标志已有证据，但 `stable-fullscreen-ime-reopen.png` 未清楚显示键帽，不能只凭 `mInputShown=true` 宣称全屏键盘视觉验收通过。此项保留限制，不在缺乏两次明确复现与归因的情况下认定新增产品 bug。

`cleanup-actions.txt` 记录专用临时 pane 已关闭；`final-ime-summary.txt` 确认恢复 Fcitx 且键盘隐藏。只清理本轮明确创建的测试 pane，保留用户既有窗格。长时间压力、严格首帧键盘时延、隐藏 WebView 零更新的运行时计数等不在本次真机证据能够证明的范围。
