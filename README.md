# 观展搭档 · Exhibit Companion

首版工程包含原生 IrisView 应用、本地后端、共享业务逻辑的浏览器开发预览和测试。展览使用英国国家美术馆历史展览「梵高：诗人与恋人」的三件作品，资料出处见 [资料来源](docs/资料来源.md)。**该展览已结束，不是当前在展或实时导航应用。**

## 现在能运行什么

- 选择作品、含糊指代与候选确认。
- 文字提问、资料检索、资料不足答复，以及当前作品的对话上下文。
- 连续修改关注点、精简内容、字号、卡片布局、显示位置与分页。
- 待命、处理中、待确认、完成、异常五种状态。
- 顺序追问、取消、重试和过期回复隔离。
- 浏览器真实麦克风录音：开始、结束发送、取消、音量/计时、60秒自动结束、静音检测、转写修正。
- 原生应用内的公开 SDK 音频会话适配与 WAV 上传代码。

模板默认 `ANSWER_MODE=evidence` 是有明确标记的**资料摘录**，不调用模型。本机已配置 DeepSeek 并通过两次真实 API 验证；硅基流动 Omni 已通过两段合成语音的在线转写、讲解、布局与文字追问验证；用户已反馈浏览器真人语音能识别；完整真人指令清单、背景人声和原生设备采音仍待验收。浏览器权限请求与取消已检查。Ubuntu原生Client与模拟器已启动并记录EXHIBIT_READY，中文显示/交互/采音逐项验收与真机验证仍待完成，详见 [验收边界](docs/验收记录.md)。

## 本地开发预览

本工程无第三方 npm 依赖。SDK 构建要求 Node 24.13.0、npm 11.6.2；`.nvmrc` 记录 Node 版本。

```bash
cd /Users/liuxiaoyu/junction/exhibit-companion
npm start
```

打开 <http://127.0.0.1:4317>。后端只绑定回环地址，不是公网部署。当前聊天中启动的服务使用临时安装并校验过的官方 Node，路径为 `/private/tmp/node-v24.13.0-darwin-x64/bin/node`，不修改全局 Node。

文字操作：选「向日葵」→ 创作背景 → 再精简 → 大字号 → 精简卡·底部 → 歧义确认 → 选择另一件作品 → 资料不足。输入“重点卡”可将当前关注点提升为标题。

语音操作：点击「开始录音」→ 首次允许麦克风 → 说“介绍向日葵，讲讲创作背景”→ 点击「结束并发送」。识别后自动进入同一对话，转写保留在输入框，改错后可点击「发送文字」。最长60秒自动结束；静音不会发给模型。录音或识别中点取消、打字、切换作品或隐藏页面，会释放麦克风并丢弃迟到结果。

浏览器录音使用 MediaRecorder/Web Audio，将采集音频解码、混为单声道并重采样到16kHz WAV，再调用同一后端转写接口。需要浏览器麦克风权限；本机回环地址可用，部署到其他主机时需安全上下文。若内置浏览器不弹出授权，请用 Chrome 打开同一地址。

## Ubuntu 迁移与首次启动

完整迁移包位于 `artifacts/exhibit-companion-ubuntu.tar.gz`，包含当前应用、调试包、原始SDK和通过官方SHA256校验的Linux Node工具链，不含密钥。解压后运行 `bash setup.sh`，单独复制已有 `.env` 到 `app/.env`，再在app目录运行 `bash tools/doctor.sh` 与 `bash tools/start-ubuntu.sh`。

详细步骤见 [Ubuntu首次运行](docs/Ubuntu首次运行.md)，演示台词和目标环境检查表见 [演示与原生验收](docs/演示与原生验收.md)。脚本已在Mac检查语法、便携自检和官方运行计划；2026-11-08已在UTM的Ubuntu22.04.5中完成迁移、官方自检、55项测试和Client/模拟器启动；显示、交互与原生采音仍待逐项验收。

## 原生 SDK 构建与运行

默认 Kit 位于相邻的 `../vendor/IrisView-Developer-Kit-v1.0.0`，可用 `IRISVIEW_KIT_ROOT` 覆盖。

```bash
npm test
npm run validate:data
bash tools/build-app.sh
```

构建产物：`artifacts/exhibit.companion.fuiapp`，包含 Linux 与 Android 源码变体，未签名调试包。它不是 APK。SDK package 记录当前 Git revision 与 dirty 状态；最终发布前应提交对应版本，并按提供方签名流程交付。

在受支持的 Ubuntu x86_64 图形环境中，先运行 Kit 的 check-host / doctor，然后启动后端，再执行：

```bash
../vendor/IrisView-Developer-Kit-v1.0.0/bin/irisview run \
  ./artifacts/exhibit.companion.fuiapp --allow-debug-unsigned --display-mode mono
```

原生控件通过 `FocusGroup` 消费导航与激活动作；Client 文字框也可提交“开始录音”“结束录音”“下一页”“取消”“重试”等指令。录音需要 Client 可用性与权限，调用 finish/cancel 后持续等到 end。

原生默认后端地址为 `http://127.0.0.1:4317`。可在 Host 提供的应用私有目录创建 `service.json`：

```json
{"baseURL":"https://your-own-backend.example/"}
```

Android 的 localhost 指设备自身；移动端需另外配置实际可达的后端，并核实目标 Client 网络策略。当前开发后端仅回环监听，不能直接当公网移动服务使用。

## 接真实 AI 和 ASR

后端启动时自动读取项目 `.env`；已配置的本机文件请保留。首次安装可将 `.env.example` 复制成 `.env`，只在本机填写密钥。密钥不进入原生应用、预览前端或源码压缩包。

```bash
npm start
```

- `ANSWER_MODE=deepseek`、`DEEPSEEK_API_KEY`、`AI_MODEL=deepseek-flash`：使用 DeepSeek Chat Completions，关闭思考模式，要求 JSON，并检查完整结束、空回复和资料 ID。
- `DEEPSEEK_BASE_URL` 默认为 `https://api.deepseek.com/`。本机已真实验证有资料回答与资料不足回答，结果见 `artifacts/deepseek-live-check.json`；这两次验证不代表完整事实验收。
- `ASR_PROVIDER=siliconflow`、`ASR_API=chat-completions`、`SILICONFLOW_API_KEY`、`ASR_MODEL=Qwen/Qwen3-Omni-30B-A3B-Instruct`：独立配置音频转写。`ASR_BASE_URL` 默认为 `https://api.siliconflow.cn/v1/`，上传 16kHz、单声道、16位 WAV，最长60秒。
- 根据用户可用清单选择 Omni Instruct，通过 Chat 的 `audio_url` 传入 base64 WAV，仅取转写文字。官方文档支持该输入方式；两段合成语音已通过在线验证，用户反馈浏览器真人识别成功，系统化真人和噪声验收仍待完成。若以后可用专用 ASR，设 `ASR_API=transcriptions` 并更换模型。
- 未配置 ASR 时明确报错，不返回模拟识别文本。DeepSeek 密钥不会用于硅基流动。
- `evidenceIds` 校验防止引用集合外资料，但不能保证每句话正确，真实生成仍需人工事实验收。

接口依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[DeepSeek JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)、[硅基流动转写接口](https://docs.siliconflow.cn/docs/api/audio-transcriptions-post)。选型和验证步骤见 [模型接入](docs/模型接入.md)。原有 OpenAI 适配保留，但本机讲解使用 DeepSeek。

## 英文操作

无需中文输入法也可调整显示：`font size larger, compact card, bottom`；精简用 `make it shorter`。在Client点击“提交文字”。完整指令见 [英文操作](docs/英文操作.md)。

## 信息卡与异常恢复

页码位于信息卡下方，首末页自动禁用翻页。字号、布局、位置只改变显示，重复相同设置不会再次调用模型。

失败时显示相应恢复入口：讲解失败可重试问题或返回已有讲解；语音失败重新录音/改用文字；原生显示失败只重新显示已有内容。返回旧讲解后，关注点和后续追问也回到该讲解。

验证方式及原生运行边界见 [信息卡与异常恢复](docs/信息卡与异常恢复.md)。

## 语音验收

原生录音改为先核对转写、输入 `confirm` 后再讲解；识别不对可重录或输入 `background` 修正。详见 [原生语音确认](docs/原生语音确认.md)。

[合成样本报告](docs/语音验收报告.md)：16段真实ASR调用，关注点修复后同批转写重放16/16指令通过；仍发现专名错误和简繁字差异。62项自动测试通过，SDK构建检查此前已通过。

[真人测试清单](docs/语音真人验收.md)：打开浏览器录音逐条检查。用户已反馈基础真人识别成功；逐条真人测试、真实展厅噪声与设备采音仍待验收。

可复现：先运行 `python3 tools/prepare-voice-benchmark.py`，再运行 `node tools/check-voice-benchmark.cjs`（调用真实ASR，会按服务规则计费）。仅重放已保存转写可用 `node tools/check-voice-benchmark.cjs --replay`，不发新的ASR请求。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/index.js` | IrisView 原生入口、生命周期、导航与呈现回执 |
| `src/domain/` | 会话状态、检索、意图规则、请求队列与过期保护 |
| `src/input/voice.js` | 音频会话、帧检查、取消、WAV 封装 |
| `src/data/exhibition.json` | 三件真实作品与来源关联 |
| `src/ui/layout.js` | 共享布局与保守分页模型 |
| `backend/` | 本地 API、资料模式与可配置外部服务适配 |
| `preview/` | 开发审阅界面，非 SDK 渲染器 |
| `tests/` | 行为、HTTP、语音与原生接线测试 |

首次 SDK 项目由官方 `irisview new` 创建并初始化 Git。完整 SDK 与文档包仍保留在上级工作区。
