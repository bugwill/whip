# Workspace / Tab / Agent-Pane 与多行点击定位执行框架

日期：2026-09-18。基线发布版本：1.7.0 / versionCode 230。

## 分工与关卡

最新发布范围：用户明确“先发布，我先使用”，允许交付当前导航/状态修复版本，由主线程构建 build 231；Codex 跨硬换行点击仍属已知未解决问题，不宣称完整修复。此前禁止部分发布的限制被此次指示覆盖。不创建远程 Release。

用户最新指示覆盖此前模型分工：由主线程直接接管，不再交给 Luna。2026-09-18 已停止 Luna/Astra 两个代理，后续修改、测试及交付判断由主线程执行。以下编号保留为历史计划，不再作为后续委派授权。

1. Luna Xhigh（gpt-5.6-luna / xhigh）：实现导航、多行点击定位和测试；完成后暂停，不先发布。
2. Astra Low（gpt-6-astra / low）：独立只读 review，列出严重程度、代码位置、复现与修改建议。
3. 原 Luna Xhigh：逐条修复审查问题并补充测试；仍有重要未解决项时不得标记全部完成。
4. Luna Xhigh：完成最终 ARM64 Release 构建、安装包校验、UPDATE.MD 与交付摘要。
5. 主线程：协调交接、核对审查处置和产物信息，不冒充指定模型的执行结果。

## 执行记录

- 实现代理已按指定模型启动：`gpt-5.6-luna`，reasoning effort `xhigh`，代理 ID `01a0b225-3de1-72d0-aecc-d1b235514e74`。
- 构建前置检查：本地 Gradle 8.13、Android SDK 与 apksigner 可用；ADB 无连接设备。
- Luna 实现阶段已交付：报告 7 套件/135 测试、TypeScript、资产一致性通过；尚未编译，版本仍为 230。
- 独立 Astra Low 审查已启动，重点核实多行后备定位的 alternate-screen 限制是否覆盖用户 Codex 场景，以及导航异步选择、编辑区判定与坐标换算。
- 审查代理：`gpt-6-astra`，reasoning effort `low`，代理 ID `01a0b238-e0b4-7750-a78d-f16946d3fce4`。审查阶段不修改代码、不编译。
- Astra 首轮审查发现 R1–R6，已回交原 Luna 修复，暂缓构建：
  - R1/P1：alternate-only 后备定位不覆盖主屏 Codex。
  - R2/P1：通用提示符启发式会把输出误认成编辑区。
  - R3/P1：空 Workspace/Tab 保留旧输入目标。
  - R4/P2：跨行后水平修正错误地使用旧列号。
  - R5/P2：区域终点固定为光标行，不能向下点击。
  - R6/P2：Workspace 单一缓存不能独立记忆各 Tab 的 Pane。
- Luna 修复阶段已交付并停止：R1 仍未闭环，真实 Codex 没有编辑区域 producer；新增接口和 synthetic fixture 不能当成真实硬换行定位完成。R2/R3/R6 报告已修复，R4/R5 仅显式协议算法层通过，待 Astra 复核。
- 用户已明确要求“完全修复再做发布”：不交付部分导航版本。已交回原 Luna Xhigh 继续真实 Codex 适配、导航边界与全量测试收尾；Astra Low 复核通过前不编译。
- Astra 第二轮维持不编译：R3 空选择仍会被旧 server focus 拉回；R6 跨 host 记忆仍有重置边界；预留编辑区域 API 尚有生命周期要求；全量三项失败未充分归因。导航也需收尾后才能单独交付，详见 REVIEW.MD。

## 功能验收

- 底部从上到下：Workspace、当前 Workspace 的 Tab、当前 Tab 的 Agent/Pane、现有固定/滚动功能键、输入法。
- 三行导航保持可见，终端真实可用高度包含新增栏位，不重复扣除键盘高度。
- Workspace 首版只切换；选择恢复、空集合、删除资源、服务器焦点更新有明确处理。
- 第三行先 Agent Pane，后普通 Pane；每个 Pane 只显示一次，只属于当前 Tab/Workspace。
- 标签能区分 Agent 和 Pane 名称；E-Ink 使用可读灰阶、名称/图标，选中有明显提示；普通模式使用适度颜色。
- 不破坏 Home / 键盘 / compose / Tab / Esc / pad 固定区；pad 不使用会覆盖 PanResponder 的 active 类。
- 多行定位需覆盖软换行、手动换行、中文宽字符、短行、光标上下移动和输入法开关。
- 多行定位只能在有证据的可编辑区域生效，不能将点击历史输出解释为向 Shell 发送上下键。
- 鼠标报告模式优先，不能重复注入鼠标点击和后备方向键；选择、长按复制、拖动滚动保持可用。
- 无法可靠判断的编辑器或模式需明确记录支持范围，不能宣称所有 TUI 均可靠定位。

## Review 输出要求

逐项说明：严重程度、文件位置、触发条件、影响、建议修复、对应回归测试。
重点检查异步切换和资源消失时旧状态是否覆盖新选择，以及多行点击是否越出输入区。
区分测试证明、源码推断、待真机验证；不得以 mock 回调通过代替完整事件链路。

## 构建交付要求

- 沿用 UPDATE.MD 的 Gradle 8.13 / ARM64 / preview signing 流程，只把 :app 输出放到 tmpfs。
- 未修改 Rust 时才允许跳过 buildRustArm64；更改相关原生代码必须重新构建对应模块。
- 校验最终复制到仓库输出路径的 APK：ZIP CRC、apksigner、aapt2 版本/ABI、zipalign。
- UPDATE.MD 写入实际 versionCode、大小、SHA-256、测试结果、审查处置、构建参数及已知限制。
- “发布”仅指本地可下载安装 APK；不创建远程 Release、不推送代码、不上传商店。
- 当前没有连接 ADB 真机。不能声称 Bigme 手势、厂商输入法、冷启动或耗电已经实测。

## 安全边界

遵守用户 AGENTS 的 SSH 密钥绝对访问禁令。不得访问任何 SSH 私钥、公钥、证书、备份、.ssh 目录，或通过 SSH 客户端加载密钥。保留全部已有工作区修改，禁止破坏性清理。
