# Astra Low 审查记录

日期：2026-09-18。执行者：gpt-6-astra / low。首轮范围：Luna 实现的三级导航、Pane 选择记忆、多行点击定位及对应测试。此文由主线程整理审查输出，不代表审查者修改了代码。

## 首轮：不建议编译交付

| 编号 | 级别 | 问题 | 修复/验证要求 |
| --- | --- | --- | --- |
| R1 | P1 | `terminal-touch-behavior.cjs` 仅在 alternate buffer 允许跨手动换行，未覆盖主屏 Codex | 明确应用编辑区域证据，覆盖主屏和 alternate，不可仅移除 buffer 限制 |
| R2 | P1 | `›` / `❯` / `> ` 文本不足以证明编辑区，会向引用/历史输出发送上下键 | 加入可信应用/编辑状态与上下界；历史提示符、引用、菜单、退出后的负例必须无输入注入 |
| R3 | P1 | `SessionScreen` 切换到没有 Pane 的 Workspace/Tab 后，旧活动终端仍可能接收输入 | 选中资源与显示/输入目标一致；空资源和最后 Pane 删除必须进入空态，禁用旧目标 |
| R4 | P2 | 跨行后沿用旧光标列，短行/宽字符/软换行时多发左右键 | 依据实际光标反馈或明确验证的编辑器语义；测试最终光标坐标而非只测字符串 |
| R5 | P2 | 编辑区下界固定为 cursorRow，无法点击光标下方 | 识别完整上下界；从首/中/末行双向点击，含空行、长输入 |
| R6 | P2 | 每 Workspace 单个 tab/pane 记录不能记忆每个 Tab 的 Pane，依赖及时服务器回报 | 分离 Workspace→Tab、Tab→Pane，host 隔离；延迟回报/快速切换/删除/外部焦点测试 |

关键反例：

- Alternate 普通输出包含 `> quoted output`，下一行是状态文字；点击引用行，不应生成 `Up + Left`。
- 当前行 `abcdefgh` 光标列 8，上一行 `ab`，点击其列 1：上移后若夹到列 2，只应左移一次，而非七次。
- A 有 Pane、B 无 Pane：切换至 B 后必须禁止再向 A 输入。
- T1/P2 → T2 → T1，服务器仍回报旧 focused P1 时，应恢复 P2。

首轮检查也确认：源码三行高度 44+55+44=143；Agent/普通 Pane 分组存在；鼠标协议优先；本次不需要改动原固定功能栏。原新增测试主要是纯函数覆盖，不能证明异步选择正确。

## 验证范围

Astra 读取了计划、UPDATE 1.1、相关源码与 diff，并运行四个纯函数反例。未编译、未访问 SSH 或真实凭据、未做 Bigme/IME 真机测试；未复跑 Luna 所称全部 135 测试。后续处置必须记录实际测试，不将首轮报告算作通过。

## 后续处置

已回交同一 Luna Xhigh 修复，随后由同一 Astra Low 再次只读复核。未批准构建。

## 第二轮：仍不满足完整验收

- R1/P1 仍开放：没有真实 Codex producer，setEditableRegion 只是协议预留，不能解决用户现有 Codex 硬换行点击。
- R2 关闭：通用提示符/alternate/十二行启发式已移除，无协议时拒绝跨硬换行注入。
- R3/P2 仍开放：空选择可清空 activeTarget，但 followServerFocus 可能据旧 snapshot 将选择拉回原 Workspace/Tab；需主动选择空资源的组件测试。
- R4/R5 只记为显式协议层修正，依赖 synthetic 编辑器语义，不能认定真实 Codex 已验证。
- R6 同 host 分层记忆已修，切 host 时删除目标缓存导致 A→B→A 不恢复旧本地选择，仍需处理。
- 预留 API 接入前须验证 revision、producer target/generation；当前无 producer，但未来接入不能重用过期区域。
- Luna 报告相关 6 套件115项和最终4套件27项通过、静态检查通过；全量143/146套件通过，三项失败未充分归因，不能称全量通过或断言与本次无关。Astra 本轮未重跑这些测试。

当前仅为阶段源码成果，未编译发布，版本维持230。用户已明确要求完全修复后再发布，原 Luna Xhigh 已继续处理全部开放项。不可擅自扩大到修改远端 Codex，也不能把未接入接口宣传为用户问题已修复。

## 独立全量测试诊断

Astra 于 2026-09-18 10:37（新加坡时间）运行 Jest `--runInBand --silent --no-cache --watchman=false`：146 套件中143通过、3失败；1096项中1066通过、30失败。三个失败套件独立进程复跑均复现，已交 Luna 修复：

- terminalComposerKeyboard：20项挂载失败，renderer mock 缺新增 setEditableRegion，直接关联本次接口变更。
- agentChatViewport：9项失败，React Native mock 缺 AppState；独立复现，不是已证实的跨套件污染。
- architectureBoundaries：1项失败，文件读取测试白名单缺 appStartupConcurrency、terminalEinkStream，须依架构约定处理。

该诊断未修改源码、未构建，不算最终验收通过。

## 主线程接管修复

发布决策更新：用户在知悉跨行点击尚未完成后要求“先发布，我先使用”。主线程据此构建当前部分修复版本，不将此决策记为 R1/R4/R5 通过；下面的禁发结论为该次指示之前的历史状态。

用户要求不再给 Luna 后，两个代理均已停止，无遗留测试进程。主线程直接新增组件级回归用例，复现并修复跨 host 返回时只恢复标签、不恢复实际输入 target 的问题：恢复本地选择时同时设置待确认 Pane、调用最新激活回调，并保留本地选择意图。跨 host 重置 focus 队列，避免旧连接挂起阻塞新 host；资源删除后释放失效选择意图。

新增测试覆盖空 Workspace/Tab 主动选择、旧 snapshot、删除后的恢复、A→B→A 同 ID 主机隔离及 Pane 输入 target 恢复。先前的三组全量失败已解决。最终检查结果记录于 UPDATE.MD。

R1/R4/R5 仍未完成：TerminalFrame 只携带 ANSI/UTF-8 帧，不携带未提交 Codex 编辑文本、区域边界、命中坐标或编辑版本；现有 Agent transcript 不是输入草稿。setEditableRegion 无真实 producer，保留接口的生命周期审查项也未因此关闭。不得以全量 Jest 通过推导真实 Codex 跨硬换行定位通过。继续禁止发布；如需修改 Codex 端，必须先确认实际源码范围和授权，禁止访问 SSH 密钥。
