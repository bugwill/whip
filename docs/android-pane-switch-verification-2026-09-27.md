# Android pane切换修复验证

日期：2026-09-27。执行GPT-6 Sol medium；生产代码由主代理审核，本任务不修改生产文件。

## 状态

旧/新各三轮CPU采样、新版三个pane身份/输入/恢复检查完成。仅本场景通过；没有测量物理面板延迟或真实续航。

## 旧基线条件与脚本

旧包SHA256 `fe153850af68df4ef5a6009ee0861735b64d9582475899905daacda4c2237115`。AppPID2040/WebViewPID3689，100ticks/CPU秒。

通过已有认证连接UI创建独立 `whip-pane-switch-test-20260927` workspace，cwd /tmp，1tab3个空闲shell pane。没有直接读密钥/配置/应用私有存储，没有给真实agent输入或关闭它们。真实agent继续并行工作，是CPU归因混杂因素。

固定屏幕1860×2480，brightness103，E-Ink profile延续原选择，USB充电，stayon2；原stayon0，原IME微信，测试临时LatinIME。全部CPU轮关闭Compose和键盘，不截图、不trace、不输入。

pane rail坐标A(175,2320)、B(445,2320)、C(715,2320)，都位于Open pane区域，不点关闭X。每轮先回A稳定5s，随后 `[B,C,B,A,C,A]×5`，30次切换，以主机单调deadline固定2s间隔，共约60s；0/30/60秒采utime+stime。旧/新三轮采用同一脚本与坐标，新包先做三pane非空warmup。

标记准备阶段Compose/IME异步变换造成C命令文本校验失败而中止，未send未校验的命令。A/B发送尝试后切换未形成可见持久marker；旧CPU后A截图有非空shell prompt，但严格逐pane身份和每次first-frame恢复未完成，不能仅凭高亮宣称。新版CPU后另做单步身份/输入检查，避免改变CPU比较场景。

## 旧原始采样

|轮|秒点|monotonic秒|App ticks|WebView ticks|
|---:|---:|---:|---:|---:|
|1|0|1265367.034627333|29360|3427|
|1|30|1265397.141236004|32741|3659|
|1|60|1265427.115703369|36087|3844|
|2|0|1265432.339556148|36130|3845|
|2|30|1265462.486639274|39589|4083|
|2|60|1265492.412530511|42921|4289|
|3|0|1265497.611059634|42991|4290|
|3|30|1265527.683143132|46258|4477|
|3|60|1265557.708828833|49637|4680|

旧三轮实际时长及CPU秒：60.081076036s/67.27 App+4.17 WebView；60.072974363s/67.91+4.44；60.097769199s/66.46+3.90。每轮从起点到终点ticks差除100；占用按各自实际时长归一化，不把大于100%的App多线程CPU当作错误，也不把CPU率当耗电比例。

旧轮起止电池：75%/33.5°C/2209500µAh→76%/33.7°C/2238960µAh；76%/33.5°C→76%/33.8°C；76%/33.8°C→76%/34.0°C，后两轮电荷计数均2238960µAh。全程USB充电，不能推续航收益。

## 新包与功能结果

新版SHA256 `cb665fc77d60314818d42f9bc9b3504246ef0b935df4b6e8fdf17f04788301b7`，release代理验证设备base.apk与产物一致、正常R8 Release、arm64-v8a、version1.7.0(245)，启动fatal markers为0。采样AppPID21218/WebViewPID21763。

CPU采样后才分别在独立shell发送逐字经UI校验的 `export PS1='WHIP_PANE_A> '; echo WHIP_PANE_A_READY`（B/C对应替换字母）。各次发送观察命令执行与提示符；关闭Compose/键盘后回切A→B→C，各自持久 `WHIP_PANE_A>`、`WHIP_PANE_B>`、`WHIP_PANE_C>` 对应选中pane，无空白/错身份。主代理视觉复核了三张测试截图：A含命令行和prompt，B含prompt，C含READY正文和prompt；不声称最终三图都保留READY输出。截图在复核后删除。本次检查是切换后约2秒的恢复内容，不是逐帧first-frame延迟证明，也不覆盖每次切换的输入ACK计数。

## 新原始采样与归一化比较

|轮|秒点|monotonic秒|App ticks|WebView ticks|
|---:|---:|---:|---:|---:|
|1|0|1266297.181017208|2077|404|
|1|30|1266327.243506967|3845|581|
|1|60|1266357.231371850|5643|732|
|2|0|1266362.376494416|5699|733|
|2|30|1266392.428350938|7408|878|
|2|60|1266422.434056410|9253|1052|
|3|0|1266427.592295437|9280|1052|
|3|30|1266457.652927127|11082|1220|
|3|60|1266487.648373767|12885|1412|

CPU率 = (末ticks−首ticks)/100/实际单调时间×100%，按单核CPU百分比表示；总体使用sumCPU秒/sumtime，不取百分比简单平均。

|版本/轮|实际秒|App CPU秒|WebView CPU秒|App %|WebView %|合计 %|
|---|---:|---:|---:|---:|---:|---:|
|旧/1|60.081076036|67.27|4.17|111.97|6.94|118.91|
|旧/2|60.072974363|67.91|4.44|113.05|7.39|120.44|
|旧/3|60.097769199|66.46|3.90|110.59|6.49|117.08|
|旧/总体|180.251819598|201.64|12.51|111.87|6.94|118.81|
|新/1|60.050354642|35.66|3.28|59.38|5.46|64.85|
|新/2|60.057561994|35.54|3.19|59.18|5.31|64.49|
|新/3|60.056078330|36.05|3.60|60.03|5.99|66.02|
|新/总体|180.163994966|107.25|10.07|59.53|5.59|65.12|

本轮观察合计CPU率下降 45.19%。旧/新是顺序采样而非交错随机对照；并行真实agents、温度和采样时段可能影响结果，三轮小样本不足以确定一般收益。固定屏幕/亮度/Compose关闭/键盘关闭/空闲shell内容与切换脚本；身份命令仅在新版CPU结束后执行。未开启诊断trace，未计量bridge、snapshot、proposeDimensions次数，不能将CPU差异精确拆解到两项修复。USB充电，不能把CPU下降解释为耗电或续航改善百分比。

新版电池起止（温度单位0.1°C、电荷µAh）：

- 轮1：{'level': 82, 'temperature': 333, 'Charge counter': 2415720} → {'level': 82, 'temperature': 333, 'Charge counter': 2415720}。

- 轮2：{'level': 82, 'temperature': 333, 'Charge counter': 2415720} → {'level': 83, 'temperature': 334, 'Charge counter': 2445180}。

- 轮3：{'level': 83, 'temperature': 334, 'Charge counter': 2445180} → {'level': 83, 'temperature': 337, 'Charge counter': 2445180}。

## 恢复与清理

关闭前UI确认唯一 `Close whip-pane-switch-test-20260927 space`，确认对话框逐字为此label后才点Close。关闭后UI XML中该label匹配数0；没有关闭真实workspace或给真实agent发送输入。

恢复结果：`ime set com.tencent.wetype/.plugin.hld.WxHldService` 成功，`settings get secure default_input_method` 返回同值；`svc power stayon false` 后 `settings get global stay_on_while_plugged_in` 返回0；亮度仍103。结束电池85%、33.5°C、2504100µAh，USB powered=true。此场景未启动atrace，无后台trace需要停止。

主代理已复核三张测试终端截图并授权删除。下列原始JSON仅含采样数值及测试坐标，完整保留在报告；临时脚本、JSON、测试截图与UI XML按确切路径清理，不删除release代理目录/回滚包。ADB交回主代理。

## 脱敏完整原始数据


### old

```json
{
  "version": "old",
  "appPid": 2040,
  "webPid": 3689,
  "sequencePaneX": [
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175
  ],
  "y": 2320,
  "intervalSeconds": 2,
  "rounds": [
    {
      "batteryStart": {
        "level": 75,
        "temperature": 335,
        "Charge counter": 2209500
      },
      "samples": [
        {
          "monotonic": 1265367.034627333,
          "appTicks": 29360,
          "webTicks": 3427
        },
        {
          "monotonic": 1265397.141236004,
          "appTicks": 32741,
          "webTicks": 3659
        },
        {
          "monotonic": 1265427.115703369,
          "appTicks": 36087,
          "webTicks": 3844
        }
      ],
      "batteryEnd": {
        "level": 76,
        "temperature": 337,
        "Charge counter": 2238960
      }
    },
    {
      "batteryStart": {
        "level": 76,
        "temperature": 335,
        "Charge counter": 2238960
      },
      "samples": [
        {
          "monotonic": 1265432.339556148,
          "appTicks": 36130,
          "webTicks": 3845
        },
        {
          "monotonic": 1265462.486639274,
          "appTicks": 39589,
          "webTicks": 4083
        },
        {
          "monotonic": 1265492.412530511,
          "appTicks": 42921,
          "webTicks": 4289
        }
      ],
      "batteryEnd": {
        "level": 76,
        "temperature": 338,
        "Charge counter": 2238960
      }
    },
    {
      "batteryStart": {
        "level": 76,
        "temperature": 338,
        "Charge counter": 2238960
      },
      "samples": [
        {
          "monotonic": 1265497.611059634,
          "appTicks": 42991,
          "webTicks": 4290
        },
        {
          "monotonic": 1265527.683143132,
          "appTicks": 46258,
          "webTicks": 4477
        },
        {
          "monotonic": 1265557.708828833,
          "appTicks": 49637,
          "webTicks": 4680
        }
      ],
      "batteryEnd": {
        "level": 76,
        "temperature": 340,
        "Charge counter": 2238960
      }
    }
  ]
}
```

### new

```json
{
  "version": "new",
  "appPid": 21218,
  "webPid": 21763,
  "sequencePaneX": [
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175,
    445,
    715,
    445,
    175,
    715,
    175
  ],
  "y": 2320,
  "intervalSeconds": 2,
  "rounds": [
    {
      "batteryStart": {
        "level": 82,
        "temperature": 333,
        "Charge counter": 2415720
      },
      "samples": [
        {
          "monotonic": 1266297.181017208,
          "appTicks": 2077,
          "webTicks": 404
        },
        {
          "monotonic": 1266327.243506967,
          "appTicks": 3845,
          "webTicks": 581
        },
        {
          "monotonic": 1266357.23137185,
          "appTicks": 5643,
          "webTicks": 732
        }
      ],
      "batteryEnd": {
        "level": 82,
        "temperature": 333,
        "Charge counter": 2415720
      }
    },
    {
      "batteryStart": {
        "level": 82,
        "temperature": 333,
        "Charge counter": 2415720
      },
      "samples": [
        {
          "monotonic": 1266362.376494416,
          "appTicks": 5699,
          "webTicks": 733
        },
        {
          "monotonic": 1266392.428350938,
          "appTicks": 7408,
          "webTicks": 878
        },
        {
          "monotonic": 1266422.43405641,
          "appTicks": 9253,
          "webTicks": 1052
        }
      ],
      "batteryEnd": {
        "level": 83,
        "temperature": 334,
        "Charge counter": 2445180
      }
    },
    {
      "batteryStart": {
        "level": 83,
        "temperature": 334,
        "Charge counter": 2445180
      },
      "samples": [
        {
          "monotonic": 1266427.592295437,
          "appTicks": 9280,
          "webTicks": 1052
        },
        {
          "monotonic": 1266457.652927127,
          "appTicks": 11082,
          "webTicks": 1220
        },
        {
          "monotonic": 1266487.648373767,
          "appTicks": 12885,
          "webTicks": 1412
        }
      ],
      "batteryEnd": {
        "level": 83,
        "temperature": 337,
        "Charge counter": 2445180
      }
    }
  ]
}
```
