# Android E-Ink 最终源码、安装与实机复核

日期：2026-09-27，约14:40–14:51 SGT。执行：GPT-6 Sol medium。主代理审核冻结后，本阶段未修改生产代码。用户已接受USB充电条件下真实续航定量证据缺口。

## 包与源码完整性

- 正常R8 Release：`android/app/build/outputs/apk/release/app-release.apk`。独立重新计算本地APK与设备`pm path`返回的base.apk SHA256，均为 `fe153850af68df4ef5a6009ee0861735b64d9582475899905daacda4c2237115`。
- 包内 `assets/herdr-terminal.html` 与冻结后的 `android/app/src/main/assets/herdr-terminal.html` 逐字节一致；确认包含诊断generation及collect ACK逻辑。`node scripts/sync-terminal-assets.mjs --check` 再次退出0。
- Release代理确认1.7.0(245)、arm64-v8a、非debuggable、R8执行、ZIP CRC/aapt2/apksigner/zipalign通过及启动无fatal；详见 `android-eink-release-validation-2026-09-27.md`。版本号与旧包相同不能证明源码相同；以新产物hash、冻结源码构建记录和包内资产一致性区分。
- 只读源码核对：后台自动投影在`AppCore.view()`前门控，恢复同步发布stateRef；显式操作和逐事件通知路径保留。终端250/500ms、SSH两UTF-8分支、输入/首响应/完整baseline快通道、队列顺序及销毁清理完整。OpenCode Notify/epoch/generation退避与monitoring60/120/300s、有效订阅检查及force_reconcile与验证文档一致。未发现需改生产代码的新阻断。

自动验证与真机证据分开：集成Jest12套91项、Rust31+88+15项、TypeScript/定向lint由构建与实现记录支持；本执行者终端6套61项已复核通过。本阶段不重复无关编译。自动测试不能替代下述设备观察。

## 条件与独立负载

同一设备 `BA51B0H2FK7A007000047`，Android14、WebView beta155.0.8059.16，E-Ink设置在UI确认selected=true，brightness103，USB充电，测试期stay_on=2。厂商刷新模式/实际前光未量化。旧版结束温度33.2°C，新版开始33.5°C、58%、1708680µAh；180s后33.8°C、61%、1797060µAh；全部验证结束33.9°C、63%、1855980µAh。

只使用旧基线创建的独立workspace `whip-eink-test-20260927`、cwd `/tmp`，从UI灰选中标签与WHIPDONE/tmp prompt确认，未向真实agent发消息或终止其进程。保留的精确261字符命令通过Compose UI与本地逐字匹配后Send。发送的字节工作负载与旧版相同（视口条件不完全相同）：1800次 `\033[32mWHIPSEQ %04d\033[0m`，每次flush、sleep0.1，结束打印 `WHIPDONE count=1800 sum=1620900`。

CPU采样开始于Send前；前30s内截图一次确认0115…0134连续，并Back隐藏键盘；30→180s无截图、无trace、无额外UI操作。App PID2040，绑定该App的WebView sandbox PID3689，100ticks/CPU秒。实际尾段截图确认1772…1800连续、WHIPDONE和shell prompt；未全量提取1800行，因此不声称全流无丢帧。

真实agents仍并行工作、网络/设备温度变化，以及未严格归一化终端视口均是混杂因素。旧版基线尾段检查时Compose已关闭；新版稳态保留空Compose区域（键盘已隐藏）。按本次截图几何估算，Compose占约240–250个设备物理像素高度（1860×2480屏幕），减少约5行的可见终端高度；旧尾截图1767…1800共34行，新尾1772…1800共29行。首尾序号也受滚动位置影响，不能当精确layout测量，但视口不同可能减少可见行更新/绘制工作量，削弱CPU归因。未保存两版完全相同像素视口的对照证据。下面CPU比值是这两次观察的归一化比较，不能准确归因每个改动，也不是严格的多轮因果功耗试验。

## 前台CPU原始值与比较

`/proc/<pid>/stat`的utime+stime累计ticks；时间来自主机单调钟。旧PID28589/WebView28893，新PID2040/WebView3689。只计算这些进程，不覆盖系统合成器/面板驱动等全部设备工作。

|旧点秒|monotonic秒|App ticks|WebView ticks|
|---:|---:|---:|---:|
|0|1261630.275874701|129642|19883|
|30|1261660.438399222|131368|20218|
|60|1261690.513247203|133363|20729|
|90|1261720.626631235|135329|21241|
|120|1261750.722790388|137316|21779|
|150|1261780.805060823|139294|22284|
|180|1261810.957737732|141275|22806|

|新点秒|monotonic秒|App ticks|WebView ticks|
|---:|---:|---:|---:|
|0|1263590.098593218|4574|479|
|30|1263620.204944049|5474|714|
|60|1263650.286179187|6547|975|
|90|1263680.382221798|7588|1237|
|120|1263710.467087131|8719|1495|
|150|1263740.615319112|9759|1762|
|180|1263770.749856604|10807|2019|

主要比较使用各自30→180秒稳态，CPU秒=`ticks差/100`，单核占用=`CPU秒/各自实际时长`：

|版本|实际时长秒|App CPU秒 / 单核|WebView CPU秒 / 单核|合计单核|
|---|---:|---:|---:|---:|
|旧|150.519338510|99.07 / 65.82%|25.88 / 17.19%|83.01%|
|新|150.544912555|53.33 / 35.42%|13.05 / 8.67%|44.09%|

按实际区间时长归一化，新/旧App CPU率约0.5382，WebView0.5042，合计0.5312（本轮观察分别低46.18%、49.58%、46.88%）。这是CPU率，**不是电池省电比例或续航改善比例**。单轮、有并行agents和上述混杂，不能据此保证长期效果。

## Home后台30s与生命周期

旧原始：monotonic1261908.778592972/App145287/Web23470 → 1261939.057311291/App145558/Web23472，30.278718319s，App2.71CPU秒/Web0.02。

新原始：monotonic1263800.814770689/App11266/Web2033 → 1263830.994717858/App11436/Web2036，30.179947169s，App1.70CPU秒/Web0.03。新App约5.63%单核，旧约8.95%；短样本WebView0.02/0.03不能解释为可靠回退。

新版Home观察起止HerdrBackgroundService均isForeground=true，mWakefulness=Awake，无Whip/Herdr唤醒锁标签。回前台测试终端出现连接提示后自动恢复WHIPDONE及prompt，随后输入样本成功，支持本次后台/恢复路径可用。未重复锁屏或网络切换，不能推广成全部生命周期已验收；也不能据未观察持锁删WakeLock。通知原配置保留，但没有受控agent消息，未证明通知无漏重。

## 单独软件输入延迟场景

实际成功启动 `adb shell atrace --async_start -b 8192 -a io.github.kaminarios.whip view webview input`，并通过 `--async_stop`停止、导出。CPU场景中未运行trace。LatinIME `com.android.inputmethod.latin/.LatinIME`，独立测试shell prompt输入短ASCII x；两暖身后20次循环，`adb input text x` → sleep0.4 →尝试屏幕Backspace(1770,1910) → sleep0.4。Backspace未产生远端写入/可见trace，故样本只统计20个x输入；未使用Enter执行真实agent命令。

`Whip terminal input to visible`的S/F cookie配对，定义为应用终端input dispatch开始，至WebView收到对应输出后双requestAnimationFrame软件rendered消息结束。不包含此前ADB/Android IME耗时、物理E-Ink刷新、远端消息创建时刻，也不保证每次都单独归因一个网络packet。

旧/新各22完整配对，前2准备样本排除后各20；未配对start=0、finish=0。没有显式trace timeout marker统计，不能把0未配对写成一项独立timeout测量。p50/p95采用排序后nearest-rank第`ceil(p*n)`个：

|版本|n|p50 ms|p95 ms|
|---|---:|---:|---:|
|旧|20|84.436|118.960|
|新|20|70.661|88.432|

本轮小样本软件延迟未见回退；仅一次短trace场景，不能宣称设备输入p95长期改善或物理面板更快。两版本暖身步骤不是逐触点完全相同，统计20个稳态x样本；设备后台工作/网络仍有噪声。

按输入顺序保留全部脱敏数值：

旧ms：`199.582, 118.96, 103.563, 94.468, 90.836, 100.669, 77.989, 87.33, 80.009, 84.436, 65.612, 71.378, 69.815, 92.239, 79.388, 60.981, 69.219, 85.308, 85.643, 79.725`。

新ms：`71.32, 70.513, 64.427, 69.125, 66.032, 72.818, 88.134, 75.486, 67.644, 85.904, 86.106, 70.661, 59.246, 69.831, 89.77, 49.215, 71.3, 71.857, 70.068, 88.432`。

旧暖身ms：`315.615, 783.761`；新暖身ms：`86.604, 70.617`（均不纳入20样本分位数）。完整trace和UI内容不保留。

## 清理、恢复及尚未验证

只点Herd rail上 `Close whip-eink-test-20260927 space`，确认对话 `Close Herdr workspace?`正文逐字为唯一测试label后关闭。后续UI XML中该label匹配0；没有关闭其他workspace、tab或真实agent。测试prompt暂留ASCII串随该独立workspace销毁，不保留测试shell。

实际恢复命令与读取结果：

```sh
adb -s BA51B0H2FK7A007000047 shell ime set com.tencent.wetype/.plugin.hld.WxHldService
# selected for user 0
adb -s BA51B0H2FK7A007000047 shell svc power stayon false
adb -s BA51B0H2FK7A007000047 shell settings get global stay_on_while_plugged_in
# 0
adb -s BA51B0H2FK7A007000047 shell settings get secure default_input_method
# com.tencent.wetype/.plugin.hld.WxHldService
```

trace已明确停止；完整trace、主机/设备截图XML及已归档数值样本/回放命令临时文件在报告保存后清理。Release交付APK/回滚副本及其他代理目录不在本任务删除范围。

仍未验证：真实未充电多轮电荷/功率对照、物理面板刷新/input p95、Release手动诊断全链快照导出与真实注入次数/OpenCode cursor请求率、Chat最终消息可见、通知完整性、断网/网络切换/重复锁屏恢复、完整ANSI/TUI全流内容一致性和隐藏plain SSH持续压力。上述有相应代码/单测证明的部分不能伪装为本次实机已测；本次USB充电电量上涨不能量化应用耗电。keepalive/inactivity/WakeLock保持原策略。
