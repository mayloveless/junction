# Ubuntu 首次运行

目标环境：Ubuntu 22.04.5 Desktop amd64，属于SDK支持的Ubuntu 22.04 x86_64。建议在虚拟机的Ubuntu本地Home文件系统中解压，不直接在共享文件夹中运行SDK。

## 1. 解压迁移包

把 `exhibit-companion-ubuntu.tar.gz` 复制进Ubuntu，例如下载目录。在Ubuntu终端运行：

```bash
cd ~/Downloads
tar -xzf exhibit-companion-ubuntu.tar.gz
cd Exhibit-Companion-Ubuntu
bash setup.sh
```

`setup.sh` 校验迁移包文件，解压随包提供的官方Linux Node 24.13.0/npm 11.6.2与原始SDK；工具链只在项目 `.tools/` 内，不替换系统Node。应用没有第三方npm依赖，使用离线 `npm ci`。

随后调用SDK原装依赖安装器。它会列出缺少的系统包并预演apt，再由终端提示输入 `INSTALL`；按屏幕提示完成。脚本不会改写原始SDK或创建Git提交。迁移包携带原工程Git基准，初始化后当前源文件仍表现为未提交修改。

如果系统缺少基础命令或apt安装器失败，按其提示补齐，再运行 `bash setup.sh`。安装器不绕过系统权限，Ubuntu桌面/网络/图形驱动问题仍需按实际日志处理。

## 2. 复制已有密钥配置

迁移包不包含密钥。将Mac原工程 `exhibit-companion/.env` 单独复制到解压后的 `Exhibit-Companion-Ubuntu/app/.env`，保留现有DeepSeek和硅基流动配置，不需要重新生成Key。

若没有复制，setup会创建默认资料摘录模式的 `.env`，可以先验证显示和导航，语音及真实AI会明确显示未配置。复制好后执行：

```bash
cd app
chmod 600 .env
bash tools/doctor.sh
```

自检检查固定工具链、系统/架构、图形会话、应用资料和服务配置，再运行官方 `irisview doctor`。日志保存在 `.logs/preflight.json` 与 `.logs/sdk-doctor.json`，不输出密钥。自检的“已配置”不等于在线服务调用成功。

## 3. 启动后端和原生应用

自检通过后，在同一Ubuntu桌面终端运行：

```bash
bash tools/start-ubuntu.sh
```

脚本先检查环境和调试包，再启动仅绑定 `127.0.0.1:4317` 的后端，并通过官方SDK打开Client和单目模拟器。Client与后端都在Ubuntu，不需要暴露Mac端口或配置虚拟机到Mac的网络。

若已有正确的本应用后端，会复用；若4317被其他服务占用，会停止并提示，不会结束其他进程。退出Client或Ctrl+C结束会话时，只清理本脚本启动的后端。日志：`.logs/backend.log`，SDK运行数据放在项目 `.state/irisview/`，不写入SDK。

浏览器预览另开Ubuntu终端运行 `bash tools/start-preview.sh`，打开 `http://127.0.0.1:4317`。如果原生启动脚本已启动后端，直接打开网址即可，不必重复启动。

## 常用变体

```bash
# 只检查官方运行计划，不启动后端、Client或模拟器
bash tools/start-ubuntu.sh --dry-run

# 同时显示左右眼
bash tools/start-ubuntu.sh --stereo

# 改源码并重新打包后，显式允许同版本调试覆盖，保留应用数据
bash tools/start-ubuntu.sh --replace-debug

# 修改后构建
bash tools/build-app.sh
```

单独构建前需要激活本地工具链：`export PATH="$PWD/.tools/node-v24.13.0-linux-x64/bin:$PATH"`。启动/自检脚本会自行选择该工具链；`npm test`、手工SDK命令也应使用固定版本。

不要用重置或删除应用数据来解决普通启动问题；先保存自检日志和SDK提示。蓝牙真机、Android安装、设备配套Client与眼镜麦克风不由此脚本配置。

## 首次验收顺序

1. Client与单目模拟器窗口出现，应用显示“观展搭档”。
2. 导航焦点可移动并激活作品按钮；文字输入能选择作品。
3. 中文字体完整，页面没有裁字；大字号、底部布局和分页边界正常。
4. 模型凭证复制后，讲解能返回来源；资料不足时能说明。
5. Client确认麦克风权限，录音能结束并返回转写。Ubuntu实际采音仍需此步骤验收，不能以Mac浏览器成功代替。
6. 语音→文字继续追问、取消、切作品与异常恢复正常。

演示台词和检查表见 `app/docs/演示与原生验收.md`（如果已在app目录，则为 `docs/演示与原生验收.md`）。
